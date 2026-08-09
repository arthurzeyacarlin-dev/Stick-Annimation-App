import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { DrawingRightPanel } from "./DrawingRightPanel";
import {
  cloneDrawingTextObjects,
  DEFAULT_DRAWING_TEXT_COLOR,
  DEFAULT_DRAWING_TEXT_FONT,
  DEFAULT_DRAWING_TEXT_SIZE,
  DEFAULT_DRAWING_TEXT_WIDTH,
  DRAWING_TEXT_FONTS,
  drawDrawingTextObject,
  measureDrawingTextDisplayRect,
  measureDrawingTextLayout,
  measureDrawingTextObjectBounds,
  normalizeDrawingTextRotation,
  type DrawingTextObject,
} from "./drawingText";
import type { DrawingShapeType, DrawingToolName } from "./DrawingToolBar";
import type { BrushToolVariant, DrawingRightPanelTab } from "./DrawingRightPanel";
import type { DrawingAiActionPlan, DrawingAiProjectMemory, DrawingAiWorkspaceContext } from "@/src/lib/ai/drawingAiContract";
import type { GeneratedFrameRenderResult } from "@/src/lib/ai/drawingFrameExecutor";

type LassoPoint = {
  x: number;
  y: number;
  pixelX: number;
  pixelY: number;
};

type CanvasPoint = {
  x: number;
  y: number;
  pixelX?: number;
  pixelY?: number;
};

type RectBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type OnionTintKind = "previous" | "next";
type ResizeHandle = "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";
type ResizeIntentLock = "horizontal" | "vertical" | "diagonal";
type ResizeDirectionalResponse = {
  deltaX: number;
  deltaY: number;
  intentLock: ResizeIntentLock | null;
};
type BitmapCornerIntentFamily = "linked" | "axial";
type BitmapResizeDirectionalResponse = ResizeDirectionalResponse & {
  intentFamily: BitmapCornerIntentFamily | null;
  shouldRebaseSegment: boolean;
};
type ResolvedResizeRect = RectBounds & {
  flipX: boolean;
  flipY: boolean;
};
type RotationHandleBounds = RectBounds & {
  centerX: number;
  centerY: number;
  connectorX: number;
  connectorY: number;
};

type BitmapResizeInteractionState = {
  handle: ResizeHandle;
  startPointerX: number;
  startPointerY: number;
  intentStartPointerX: number;
  intentStartPointerY: number;
  lastPointerX: number;
  lastPointerY: number;
  startRotation?: number;
  startWidth: number;
  startHeight: number;
  startFlipX: boolean;
  startFlipY: boolean;
  startX: number;
  startY: number;
  intentFamily: BitmapCornerIntentFamily | null;
  intentLock: ResizeIntentLock | null;
};

type ActiveTextSelection = {
  kind: "text";
  objectIds: string[];
};

type ActiveBitmapTransformSelection = RectBounds & {
  flipX: boolean;
  flipY: boolean;
  rotation: number;
};

type ActiveLassoBitmapSelection = ActiveBitmapTransformSelection & {
  kind: "bitmap";
};

type ActiveBoxBitmapSelection = ActiveBitmapTransformSelection & {
  kind: "bitmap";
};

type ActiveLassoSelection =
  | ActiveLassoBitmapSelection
  | (ActiveTextSelection & {
      flipX: false;
      flipY: false;
    });

type LassoInteractionState =
  | { mode: "drawing" }
  | { mode: "pending-new-selection"; startPointerX: number; startPointerY: number; originPoint: LassoPoint }
  | { mode: "moving"; startPointerX: number; startPointerY: number; startX: number; startY: number }
  | {
      mode: "resizing";
      handle: ResizeHandle;
      startPointerX: number;
      startPointerY: number;
      intentStartPointerX: number;
      intentStartPointerY: number;
      lastPointerX: number;
      lastPointerY: number;
      startWidth: number;
      startHeight: number;
      startFlipX: boolean;
      startFlipY: boolean;
      startX: number;
      startY: number;
      intentDirectionX: number;
      intentDirectionY: number;
      intentFamily: BitmapCornerIntentFamily | null;
      pendingIntentLock: ResizeIntentLock | null;
      pendingIntentFamily: BitmapCornerIntentFamily | null;
      pendingIntentTravelPx: number;
      pendingIntentStableSteps: number;
      intentLock: ResizeIntentLock | null;
    }
  | {
      mode: "rotating";
      startAngle: number;
      startRotation: number;
      centerX: number;
      centerY: number;
      snapTargetRotation: number | null;
    };

type ActiveKnifePiece = {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  flipX: boolean;
  flipY: boolean;
};

type BitmapSelectionOwner = "select" | "lasso" | "knife";

type BitmapSelectionSessionItem = ActiveBitmapTransformSelection & {
  id: string;
  sourceCanvas: HTMLCanvasElement;
  allowRotation: boolean;
};

type BitmapSelectionSession = {
  owner: BitmapSelectionOwner;
  items: BitmapSelectionSessionItem[];
};

type BitmapSelectionInteractionState =
  | {
      owner: BitmapSelectionOwner;
      itemId: string;
      mode: "moving";
      startPointerX: number;
      startPointerY: number;
      startX: number;
      startY: number;
      didTransform: boolean;
    }
  | {
      owner: BitmapSelectionOwner;
      itemId: string;
      mode: "resizing";
      handle: ResizeHandle;
      startPointerX: number;
      startPointerY: number;
      intentStartPointerX: number;
      intentStartPointerY: number;
      lastPointerX: number;
      lastPointerY: number;
      startRotation: number;
      startWidth: number;
      startHeight: number;
      startFlipX: boolean;
      startFlipY: boolean;
      startX: number;
      startY: number;
      intentFamily: BitmapCornerIntentFamily | null;
      intentLock: ResizeIntentLock | null;
      didTransform: boolean;
    }
  | {
      owner: BitmapSelectionOwner;
      itemId: string;
      mode: "rotating";
      startAngle: number;
      startRotation: number;
      centerX: number;
      centerY: number;
      snapTargetRotation: number | null;
      didTransform: boolean;
    }
  | null;

type KnifeInteractionState =
  | { mode: "drawing" }
  | {
      mode: "moving";
      pieceId: number;
      startPointerX: number;
      startPointerY: number;
      startX: number;
      startY: number;
    }
  | {
      mode: "resizing";
      pieceId: number;
      handle: ResizeHandle;
      startPointerX: number;
      startPointerY: number;
      lastPointerX: number;
      lastPointerY: number;
      startWidth: number;
      startHeight: number;
      startFlipX: boolean;
      startFlipY: boolean;
      startX: number;
      startY: number;
      intentLock: ResizeIntentLock | null;
    };

type ImportedAsset = {
  id: string;
  name: string;
  kind: "image" | "file";
  sizeLabel: string;
  meta: string;
  previewUrl: string | null;
  width: number | null;
  height: number | null;
};

type ActivePlacedImageAsset = {
  id: string;
  previewUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
  flipX: boolean;
  flipY: boolean;
  rotation: number;
  naturalWidth: number;
  naturalHeight: number;
};

type DrawableImageSource = HTMLImageElement | HTMLCanvasElement;

type PlacedImageInteractionState =
  | {
      mode: "moving";
      startPointerX: number;
      startPointerY: number;
      startX: number;
      startY: number;
    }
  | {
      mode: "resizing";
      handle: ResizeHandle;
      startPointerX: number;
      startPointerY: number;
      intentStartPointerX: number;
      intentStartPointerY: number;
      lastPointerX: number;
      lastPointerY: number;
      startWidth: number;
      startHeight: number;
      startFlipX: boolean;
      startFlipY: boolean;
      startX: number;
      startY: number;
      intentDirectionX: number;
      intentDirectionY: number;
      intentFamily: BitmapCornerIntentFamily | null;
      pendingIntentLock: ResizeIntentLock | null;
      pendingIntentFamily: BitmapCornerIntentFamily | null;
      pendingIntentTravelPx: number;
      pendingIntentStableSteps: number;
      intentLock: ResizeIntentLock | null;
    }
  | {
      mode: "rotating";
      startAngle: number;
      startRotation: number;
      centerX: number;
      centerY: number;
      snapTargetRotation: number | null;
    }
  | null;

type SelectionBoxDraft = {
  start: LassoPoint;
  end: LassoPoint;
};

type TextInteractionInitialObject = {
  id: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  flipX: boolean;
  flipY: boolean;
  rotation: number;
  displayX: number;
  displayY: number;
  displayWidth: number;
  displayHeight: number;
  displayCenterX: number;
  displayCenterY: number;
};

type TextInteractionState =
  | {
      mode: "moving";
      objectIds: string[];
      startPointerX: number;
      startPointerY: number;
      initialObjects: TextInteractionInitialObject[];
    }
  | {
      mode: "resizing";
      objectIds: string[];
      handle: ResizeHandle;
      startPointerX: number;
      startPointerY: number;
      intentStartPointerX: number;
      intentStartPointerY: number;
      lastPointerX: number;
      lastPointerY: number;
      startBounds: RectBounds;
      initialObjects: TextInteractionInitialObject[];
      intentFamily: BitmapCornerIntentFamily | null;
      intentLock: ResizeIntentLock | null;
    }
  | {
      mode: "rotating";
      objectIds: string[];
      startPointerX: number;
      startPointerY: number;
      startBounds: RectBounds;
      startAngle: number;
      initialObjects: TextInteractionInitialObject[];
      rotationReference: number;
      snapTargetRotation: number | null;
    }
  | null;

type ActiveBoxSelection =
  | ActiveBoxBitmapSelection
  | ActiveTextSelection;

type BoxSelectionInteractionState =
  | {
      mode: "moving";
      startPointerX: number;
      startPointerY: number;
      startX: number;
      startY: number;
      didTransform: boolean;
    }
  | {
      mode: "resizing";
      handle: ResizeHandle;
      startPointerX: number;
      startPointerY: number;
      lastPointerX: number;
      lastPointerY: number;
      startWidth: number;
      startHeight: number;
      startFlipX: boolean;
      startFlipY: boolean;
      startX: number;
      startY: number;
      intentLock: ResizeIntentLock | null;
      didTransform: boolean;
    }
  | {
      mode: "rotating";
      startAngle: number;
      startRotation: number;
      centerX: number;
      centerY: number;
      snapTargetRotation: number | null;
      didTransform: boolean;
    }
  | null;

type PendingTextSelection =
  | {
      mode: "text";
      objectIds: string[];
    }
  | {
      mode: "select" | "lasso";
      objectIds: string[];
    }
  | null;

type LibrarySymbol = {
  id: string;
  name: string;
  tag: "symbol";
  previewUrl: string;
  width: number;
  height: number;
  signature: string;
};

type DrawingCanvasProps = {
  activeTool: DrawingToolName;
  onToolSelect?: (tool: DrawingToolName) => void;
  editingContextKey: string;
  isTimelinePlaying: boolean;
  playbackRenderScale?: number;
  brushSize: number;
  eraserSize: number;
  fillColor: string;
  shapeType: DrawingShapeType;
  activeTextObjects: DrawingTextObject[];
  canEditTextInCurrentFrame: boolean;
  onBrushSizeChange: (size: number) => void;
  onEraserSizeChange: (size: number) => void;
  onFillColorChange: (color: string) => void;
  onShapeTypeChange: (shapeType: DrawingShapeType) => void;
  onTextObjectsChange?: (nextTextObjects: DrawingTextObject[]) => boolean;
  workspaceContext?: DrawingAiWorkspaceContext | null;
  projectAiMemory?: DrawingAiProjectMemory | null;
  onProjectAiMemoryChange?: (memory: DrawingAiProjectMemory | null) => void;
  onApplyGeneratedFrame?: (
    result: GeneratedFrameRenderResult,
    source: { prompt: string; response: string },
  ) => Promise<boolean> | boolean;
  onExecuteActionPlan?: (actionPlan: NonNullable<DrawingAiActionPlan>) => Promise<boolean> | boolean;
  onAuthoringActionCommitted?: (reason: "stroke" | "shape" | "placed-asset" | "clear-canvas" | "knife" | "selection") => void;
};

export type DrawingCanvasSnapshot = {
  bitmap: ImageData | null;
  previewUrl: string | null | undefined;
  captureVersion?: number;
  dirtyPatchBitmap?: ImageData | null;
  dirtyPatchRect?: {
    left: number;
    top: number;
    width: number;
    height: number;
  } | null;
  bitmapWidth?: number;
  bitmapHeight?: number;
};

export type DrawingCanvasSnapshotOptions = {
  includePreviewUrl?: boolean;
  preferIncrementalBitmapCapture?: boolean;
};

export type DrawingCanvasPlaybackSurfaceLayout = {
  drawingCanvasWidth: number | null;
  drawingCanvasHeight: number | null;
  worldWidth: number;
  worldHeight: number;
  worldDisplayRect: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  stageDisplayRect: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
};

export type DrawingCanvasHandle = {
  captureAuthoringSnapshot: (options?: DrawingCanvasSnapshotOptions) => DrawingCanvasSnapshot | null;
  clearTransientEditingState: () => void;
  getPlaybackSurfaceLayout: () => DrawingCanvasPlaybackSurfaceLayout | null;
  hasActiveBitmapSelectionSession: () => boolean;
  hasPendingAuthoringChanges: () => boolean;
  markAuthoringChangesCommitted: (committedBitmap?: ImageData | null, captureVersion?: number | null) => void;
  setOnionOverlayContent: (content: {
    previousBitmap: ImageData | null;
    nextBitmap: ImageData | null;
    previousTextObjects: DrawingTextObject[];
    nextTextObjects: DrawingTextObject[];
  }) => void;
  shouldDeferAuthoringSnapshotCapture: (minimumIdleMs?: number) => boolean;
};

type CanvasDirtyRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const AUTHORING_SNAPSHOT_SETTLE_MS = 1200;
const EMPTY_ONION_TEXT_OBJECTS: DrawingTextObject[] = [];
const RESIZE_HANDLE_ORDER: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const ROTATION_SNAP_STEP_DEGREES = 90;
const ROTATION_SNAP_ACQUIRE_DEGREES = 6;
const ROTATION_SNAP_RELEASE_DEGREES = 12;
const ONION_TINT_STYLES: Record<OnionTintKind, { fillStyle: string }> = {
  previous: {
    fillStyle: "rgba(92, 63, 158, 0.58)",
  },
  next: {
    fillStyle: "rgba(44, 122, 91, 0.56)",
  },
};
const ONION_TEXT_MASK_COLOR = "#000000";

const SHAPE_TYPES: DrawingShapeType[] = ["Square", "Triangle", "Circle"];
const ENABLE_MOTION_TWEEN_DEBUG =
  process.env.NEXT_PUBLIC_ENABLE_MOTION_TWEEN_DEBUG === "true" || process.env.NODE_ENV === "test";
const MOTION_TWEEN_DEBUG_ALPHA_THRESHOLD = 8;

const motionTweenDebug = (scope: string, payload: Record<string, unknown>) => {
  if (!ENABLE_MOTION_TWEEN_DEBUG) {
    return;
  }

  console.debug(`[motion-tween-debug] ${scope}`, payload);
};

const motionTweenWarn = (scope: string, payload: Record<string, unknown>) => {
  if (!ENABLE_MOTION_TWEEN_DEBUG) {
    return;
  }

  console.warn(`[motion-tween-debug] ${scope}`, payload);
};

const buildResizeHandleBounds = (rect: RectBounds, handleSize: number) => {
  const halfHandle = handleSize / 2;
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const horizontalSpan = Math.max(handleSize, Math.min(rect.width / 2, handleSize * 3));
  const verticalSpan = Math.max(handleSize, Math.min(rect.height / 2, handleSize * 3));

  return {
    nw: { x: rect.x - halfHandle, y: rect.y - halfHandle, width: handleSize, height: handleSize },
    n: { x: centerX - horizontalSpan / 2, y: rect.y - halfHandle, width: horizontalSpan, height: handleSize },
    ne: { x: rect.x + rect.width - halfHandle, y: rect.y - halfHandle, width: handleSize, height: handleSize },
    e: { x: rect.x + rect.width - halfHandle, y: centerY - verticalSpan / 2, width: handleSize, height: verticalSpan },
    se: { x: rect.x + rect.width - halfHandle, y: rect.y + rect.height - halfHandle, width: handleSize, height: handleSize },
    s: { x: centerX - horizontalSpan / 2, y: rect.y + rect.height - halfHandle, width: horizontalSpan, height: handleSize },
    sw: { x: rect.x - halfHandle, y: rect.y + rect.height - halfHandle, width: handleSize, height: handleSize },
    w: { x: rect.x - halfHandle, y: centerY - verticalSpan / 2, width: handleSize, height: verticalSpan },
  } satisfies Record<ResizeHandle, RectBounds>;
};

const resolveResizeHandleAtPoint = (
  rect: RectBounds,
  point: { x: number; y: number },
  handleSize: number,
): ResizeHandle | null => {
  const handleBounds = buildResizeHandleBounds(rect, handleSize);
  for (const handle of RESIZE_HANDLE_ORDER) {
    const bounds = handleBounds[handle];
    if (
      point.x >= bounds.x &&
      point.x <= bounds.x + bounds.width &&
      point.y >= bounds.y &&
      point.y <= bounds.y + bounds.height
    ) {
      return handle;
    }
  }
  return null;
};

const buildRotateHandleBounds = (rect: RectBounds, handleSize: number): RotationHandleBounds => {
  const diameter = Math.max(handleSize + 6, 18);
  const radius = diameter / 2;
  const centerX = rect.x + rect.width + Math.max(handleSize * 1.6, 18);
  const centerY = rect.y + rect.height + Math.max(handleSize * 1.6, 18);

  return {
    x: centerX - radius,
    y: centerY - radius,
    width: diameter,
    height: diameter,
    centerX,
    centerY,
    connectorX: rect.x + rect.width,
    connectorY: rect.y + rect.height,
  };
};

const resolveRotateHandleAtPoint = (
  rect: RectBounds,
  point: { x: number; y: number },
  handleSize: number,
) => {
  const bounds = buildRotateHandleBounds(rect, handleSize);
  const radius = bounds.width / 2;
  const deltaX = point.x - bounds.centerX;
  const deltaY = point.y - bounds.centerY;
  return deltaX * deltaX + deltaY * deltaY <= radius * radius ? bounds : null;
};

const normalizeContinuousRotation = (rotation: number) => {
  if (!Number.isFinite(rotation)) {
    return 0;
  }

  const normalized = ((rotation % 360) + 360) % 360;
  return normalized > 180 ? normalized - 360 : normalized;
};

const normalizeRotationForDisplay = (rotation: number) => {
  const normalized = ((normalizeContinuousRotation(rotation) % 360) + 360) % 360;
  if (normalized >= 359.95 || normalized <= 0.05) {
    return 0;
  }
  return Math.round(normalized * 10) / 10;
};

const formatRotationDisplayValue = (rotation: number) => {
  const displayValue = normalizeRotationForDisplay(rotation);
  return Number.isInteger(displayValue) ? `${displayValue}` : displayValue.toFixed(1);
};

const resolveSnappedRotationDegrees = (
  rawRotation: number,
  snapTargetRotation: number | null,
) => {
  const normalizedRaw = normalizeContinuousRotation(rawRotation);
  if (snapTargetRotation != null) {
    const normalizedTarget = normalizeContinuousRotation(snapTargetRotation);
    const distanceFromTarget = Math.abs(normalizeContinuousRotation(normalizedRaw - normalizedTarget));
    if (distanceFromTarget <= ROTATION_SNAP_RELEASE_DEGREES) {
      return {
        rotation: normalizedTarget,
        snapTargetRotation: normalizedTarget,
      };
    }

    return {
      rotation: normalizedRaw,
      snapTargetRotation: null,
    };
  }

  const nearestSnapTarget = normalizeContinuousRotation(
    Math.round(normalizedRaw / ROTATION_SNAP_STEP_DEGREES) * ROTATION_SNAP_STEP_DEGREES,
  );
  const distanceFromSnapTarget = Math.abs(normalizeContinuousRotation(normalizedRaw - nearestSnapTarget));

  if (distanceFromSnapTarget <= ROTATION_SNAP_ACQUIRE_DEGREES) {
    return {
      rotation: nearestSnapTarget,
      snapTargetRotation: nearestSnapTarget,
    };
  }

  return {
    rotation: normalizedRaw,
    snapTargetRotation: null,
  };
};

const getRotationDeltaDegrees = (startAngle: number, currentAngle: number) =>
  normalizeContinuousRotation(((currentAngle - startAngle) * 180) / Math.PI);

const isCornerResizeHandle = (handle: ResizeHandle): handle is Extract<ResizeHandle, "nw" | "ne" | "sw" | "se"> =>
  handle === "nw" || handle === "ne" || handle === "sw" || handle === "se";

const getBitmapResizeInteractionStartRect = (interaction: BitmapResizeInteractionState): RectBounds => ({
  x: interaction.startFlipX ? interaction.startX - interaction.startWidth : interaction.startX,
  y: interaction.startFlipY ? interaction.startY - interaction.startHeight : interaction.startY,
  width: interaction.startWidth,
  height: interaction.startHeight,
});

const getBitmapTransformFromDisplayRect = (rect: ResolvedResizeRect) => ({
  x: rect.flipX ? rect.x + rect.width : rect.x,
  y: rect.flipY ? rect.y + rect.height : rect.y,
  width: rect.width,
  height: rect.height,
  flipX: rect.flipX,
  flipY: rect.flipY,
});

const rebaseBitmapResizeInteraction = (
  interaction: BitmapResizeInteractionState,
  point: { x: number; y: number },
  rect: ResolvedResizeRect,
  intentLock: ResizeIntentLock | null,
  nextHandle: ResizeHandle = interaction.handle,
) => {
  const nextTransform = getBitmapTransformFromDisplayRect(rect);
  interaction.startPointerX = point.x;
  interaction.startPointerY = point.y;
  interaction.intentStartPointerX = point.x;
  interaction.intentStartPointerY = point.y;
  interaction.lastPointerX = point.x;
  interaction.lastPointerY = point.y;
  interaction.startX = nextTransform.x;
  interaction.startY = nextTransform.y;
  interaction.startWidth = nextTransform.width;
  interaction.startHeight = nextTransform.height;
  interaction.startFlipX = nextTransform.flipX;
  interaction.startFlipY = nextTransform.flipY;
  interaction.handle = nextHandle;
  interaction.intentLock = intentLock;
};

const shouldRebaseBitmapResizeInteraction = (
  interaction: BitmapResizeInteractionState,
  nextRect: ResolvedResizeRect,
  nextHandle: ResizeHandle,
  nextIntentLock: ResizeIntentLock | null,
  options?: { rebaseOnIntentLockChange?: boolean },
) =>
  interaction.startFlipX !== nextRect.flipX ||
  interaction.startFlipY !== nextRect.flipY ||
  interaction.handle !== nextHandle ||
  ((options?.rebaseOnIntentLockChange ?? true) &&
    isCornerResizeHandle(interaction.handle) &&
    interaction.intentLock !== nextIntentLock);

const applyResizeIntentLock = (
  deltaX: number,
  deltaY: number,
  intentLock: ResizeIntentLock,
): ResizeDirectionalResponse => {
  if (intentLock === "horizontal") {
    return {
      deltaX,
      deltaY: 0,
      intentLock,
    };
  }

  if (intentLock === "vertical") {
    return {
      deltaX: 0,
      deltaY,
      intentLock,
    };
  }

  return {
    deltaX,
    deltaY,
    intentLock,
  };
};

const applyBitmapCornerResizeIntentLock = (
  handle: ResizeHandle,
  deltaX: number,
  deltaY: number,
  intentLock: ResizeIntentLock,
): ResizeDirectionalResponse => {
  if (intentLock === "horizontal" || intentLock === "vertical") {
    return applyResizeIntentLock(deltaX, deltaY, intentLock);
  }

  const localDeltaX = handle.includes("w") ? -deltaX : deltaX;
  const localDeltaY = handle.includes("n") ? -deltaY : deltaY;
  const diagonalScalar = Math.abs(localDeltaX) >= Math.abs(localDeltaY) ? localDeltaX : localDeltaY;
  const lockedLocalDeltaX = diagonalScalar;
  const lockedLocalDeltaY = diagonalScalar;
  const nextDeltaX = handle.includes("w") ? -lockedLocalDeltaX : lockedLocalDeltaX;
  const nextDeltaY = handle.includes("n") ? -lockedLocalDeltaY : lockedLocalDeltaY;

  return applyResizeIntentLock(nextDeltaX, nextDeltaY, intentLock);
};

const canBitmapCornerUseLinkedDiagonal = (
  localDeltaX: number,
  localDeltaY: number,
  axisZeroThreshold: number,
) => {
  const epsilon = Math.max(0.0001, axisZeroThreshold);
  if (Math.abs(localDeltaX) <= epsilon || Math.abs(localDeltaY) <= epsilon) {
    return true;
  }

  return Math.sign(localDeltaX) === Math.sign(localDeltaY);
};

const resolveBitmapCornerIntentFamily = (
  localDeltaX: number,
  localDeltaY: number,
  axisZeroThreshold: number,
): BitmapCornerIntentFamily =>
  canBitmapCornerUseLinkedDiagonal(localDeltaX, localDeltaY, axisZeroThreshold) ? "linked" : "axial";

const remapResizeHandleForFlipParity = (
  handle: ResizeHandle,
  previousFlipX: boolean,
  previousFlipY: boolean,
  nextFlipX: boolean,
  nextFlipY: boolean,
): ResizeHandle => {
  let nextHandle = handle;
  const horizontalPlaceholder = "__flip_x_hold__";
  const verticalPlaceholder = "__flip_y_hold__";

  if (previousFlipX !== nextFlipX) {
    nextHandle = nextHandle
      .replace(/w/g, horizontalPlaceholder)
      .replace(/e/g, "w")
      .replace(new RegExp(horizontalPlaceholder, "g"), "e") as ResizeHandle;
  }

  if (previousFlipY !== nextFlipY) {
    nextHandle = nextHandle
      .replace(/n/g, verticalPlaceholder)
      .replace(/s/g, "n")
      .replace(new RegExp(verticalPlaceholder, "g"), "s") as ResizeHandle;
  }

  return nextHandle;
};

const getRotatedRectBounds = (rect: RectBounds, rotation: number): RectBounds => {
  if (Math.abs(rotation) < 0.001) {
    return rect;
  }

  const radians = (rotation * Math.PI) / 180;
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const corners = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ].map((corner) => {
    const offsetX = corner.x - centerX;
    const offsetY = corner.y - centerY;
    return {
      x: centerX + offsetX * cos - offsetY * sin,
      y: centerY + offsetX * sin + offsetY * cos,
    };
  });

  const minX = Math.min(...corners.map((corner) => corner.x));
  const minY = Math.min(...corners.map((corner) => corner.y));
  const maxX = Math.max(...corners.map((corner) => corner.x));
  const maxY = Math.max(...corners.map((corner) => corner.y));

  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
};

const getRectCenter = (rect: RectBounds) => ({
  x: rect.x + rect.width / 2,
  y: rect.y + rect.height / 2,
});

const rotatePointAround = (
  point: { x: number; y: number },
  center: { x: number; y: number },
  rotation: number,
) => {
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const offsetX = point.x - center.x;
  const offsetY = point.y - center.y;

  return {
    x: center.x + offsetX * cos - offsetY * sin,
    y: center.y + offsetX * sin + offsetY * cos,
  };
};

const rotateVector = (deltaX: number, deltaY: number, rotation: number) => {
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return {
    x: deltaX * cos - deltaY * sin,
    y: deltaX * sin + deltaY * cos,
  };
};

const projectBitmapResizeDeltaToLocalAxes = (deltaX: number, deltaY: number, rotation: number) => {
  const normalizedRotation = normalizeContinuousRotation(rotation);
  if (Math.abs(normalizedRotation) < 0.001) {
    return { x: deltaX, y: deltaY };
  }

  return rotateVector(deltaX, deltaY, -normalizedRotation);
};

const getResizeHandlePoint = (rect: RectBounds, handle: ResizeHandle) => {
  const center = getRectCenter(rect);
  const x = handle.includes("w") ? rect.x : handle.includes("e") ? rect.x + rect.width : center.x;
  const y = handle.includes("n") ? rect.y : handle.includes("s") ? rect.y + rect.height : center.y;

  return { x, y };
};

const getOppositeResizeAnchorPoint = (rect: RectBounds, handle: ResizeHandle) => {
  const center = getRectCenter(rect);
  const x = handle.includes("w") ? rect.x + rect.width : handle.includes("e") ? rect.x : center.x;
  const y = handle.includes("n") ? rect.y + rect.height : handle.includes("s") ? rect.y : center.y;

  return { x, y };
};

const resolveBitmapResizeHandleForRotation = (
  displayRect: RectBounds,
  rotation: number,
  handle: ResizeHandle,
): ResizeHandle => {
  const normalizedRotation = normalizeContinuousRotation(rotation);
  if (Math.abs(normalizedRotation) < 0.001) {
    return handle;
  }

  const rotatedBounds = getRotatedRectBounds(displayRect, normalizedRotation);
  const targetPoint = getResizeHandlePoint(rotatedBounds, handle);
  const displayCenter = getRectCenter(displayRect);
  const candidateHandles = isCornerResizeHandle(handle)
    ? (["nw", "ne", "sw", "se"] satisfies ResizeHandle[])
    : (["n", "e", "s", "w"] satisfies ResizeHandle[]);
  let nearestHandle = candidateHandles[0];
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const candidateHandle of candidateHandles) {
    const candidatePoint = rotatePointAround(
      getResizeHandlePoint(displayRect, candidateHandle),
      displayCenter,
      normalizedRotation,
    );
    const distance = Math.hypot(candidatePoint.x - targetPoint.x, candidatePoint.y - targetPoint.y);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestHandle = candidateHandle;
    }
  }

  return nearestHandle;
};

const anchorRotatedBitmapResizeRect = (
  interaction: BitmapResizeInteractionState,
  handle: ResizeHandle,
  rect: ResolvedResizeRect,
) => {
  const normalizedRotation = normalizeContinuousRotation(interaction.startRotation ?? 0);
  if (Math.abs(normalizedRotation) < 0.001) {
    return rect;
  }

  const startRect = getBitmapResizeInteractionStartRect(interaction);
  const startAnchor = rotatePointAround(
    getOppositeResizeAnchorPoint(startRect, handle),
    getRectCenter(startRect),
    normalizedRotation,
  );
  const nextAnchor = rotatePointAround(
    getOppositeResizeAnchorPoint(rect, handle),
    getRectCenter(rect),
    normalizedRotation,
  );

  return {
    ...rect,
    x: rect.x + startAnchor.x - nextAnchor.x,
    y: rect.y + startAnchor.y - nextAnchor.y,
  };
};

const resolveCornerResizeIntentLock = (
  handle: ResizeHandle,
  deltaX: number,
  deltaY: number,
  handleSize: number,
  currentIntentLock: ResizeIntentLock | null,
): ResizeDirectionalResponse => {
  if (!isCornerResizeHandle(handle)) {
    return {
      deltaX,
      deltaY,
      intentLock: null,
    };
  }

  const movementDistance = Math.hypot(deltaX, deltaY);
  const activationDistance = Math.max(2, handleSize * 0.16);
  if (movementDistance < activationDistance) {
    if (currentIntentLock) {
      return applyResizeIntentLock(deltaX, deltaY, currentIntentLock);
    }

    return {
      deltaX,
      deltaY,
      intentLock: null,
    };
  }

  const localDeltaX = handle.includes("w") ? -deltaX : deltaX;
  const localDeltaY = handle.includes("n") ? -deltaY : deltaY;
  const angleDegrees =
    localDeltaX === 0 && localDeltaY === 0
      ? 45
      : (Math.atan2(Math.abs(localDeltaY), Math.abs(localDeltaX)) * 180) / Math.PI;
  const horizontalAcquireMax = 6;
  const horizontalReleaseMax = 12;
  const diagonalReleaseMin = 6;
  const diagonalReleaseMax = 84;
  const verticalReleaseMin = 78;
  const verticalAcquireMin = 84;

  if (currentIntentLock === "horizontal" && angleDegrees <= horizontalReleaseMax) {
    return applyResizeIntentLock(deltaX, deltaY, "horizontal");
  }

  if (currentIntentLock === "vertical" && angleDegrees >= verticalReleaseMin) {
    return applyResizeIntentLock(deltaX, deltaY, "vertical");
  }

  if (
    currentIntentLock === "diagonal" &&
    angleDegrees >= diagonalReleaseMin &&
    angleDegrees <= diagonalReleaseMax
  ) {
    return applyResizeIntentLock(deltaX, deltaY, "diagonal");
  }

  if (angleDegrees <= horizontalAcquireMax) {
    return applyResizeIntentLock(deltaX, deltaY, "horizontal");
  }

  if (angleDegrees >= verticalAcquireMin) {
    return applyResizeIntentLock(deltaX, deltaY, "vertical");
  }

  return applyResizeIntentLock(deltaX, deltaY, "diagonal");
};

const resolveResizeIntentLock = (
  handle: ResizeHandle,
  deltaX: number,
  deltaY: number,
  handleSize: number,
  currentIntentLock: ResizeIntentLock | null,
): ResizeDirectionalResponse => {
  if (handle === "e" || handle === "w") {
    return applyResizeIntentLock(deltaX, deltaY, "horizontal");
  }
  if (handle === "n" || handle === "s") {
    return applyResizeIntentLock(deltaX, deltaY, "vertical");
  }
  return resolveCornerResizeIntentLock(handle, deltaX, deltaY, handleSize, currentIntentLock);
};

const resolveBitmapSelectionResizeIntentLock = (
  handle: ResizeHandle,
  previewDeltaX: number,
  previewDeltaY: number,
  intentDeltaX: number,
  intentDeltaY: number,
  handleSize: number,
  currentIntentLock: ResizeIntentLock | null,
  currentIntentFamily: BitmapCornerIntentFamily | null,
): BitmapResizeDirectionalResponse => {
  if (!isCornerResizeHandle(handle)) {
    return {
      ...resolveResizeIntentLock(handle, previewDeltaX, previewDeltaY, handleSize, currentIntentLock),
      intentFamily: null,
      shouldRebaseSegment: false,
    };
  }

  const movementDistance = Math.hypot(previewDeltaX, previewDeltaY);
  const activationDistance = Math.max(2, handleSize * 0.16);
  if (movementDistance < activationDistance) {
    if (currentIntentLock) {
      return {
        ...applyBitmapCornerResizeIntentLock(handle, previewDeltaX, previewDeltaY, currentIntentLock),
        intentFamily: currentIntentFamily,
        shouldRebaseSegment: false,
      };
    }

    return {
      deltaX: 0,
      deltaY: 0,
      intentLock: null,
      intentFamily: null,
      shouldRebaseSegment: false,
    };
  }

  const localDeltaX = handle.includes("w") ? -intentDeltaX : intentDeltaX;
  const localDeltaY = handle.includes("n") ? -intentDeltaY : intentDeltaY;
  const axisZeroThreshold = Math.max(2, handleSize * 0.1);
  const angleDegrees =
    localDeltaX === 0 && localDeltaY === 0
      ? 45
      : (Math.atan2(Math.abs(localDeltaY), Math.abs(localDeltaX)) * 180) / Math.PI;
  const nextIntentFamily = resolveBitmapCornerIntentFamily(localDeltaX, localDeltaY, axisZeroThreshold);
  const absLocalX = Math.abs(localDeltaX);
  const absLocalY = Math.abs(localDeltaY);
  const dominantAxis = Math.max(absLocalX, absLocalY);
  const secondaryAxis = Math.min(absLocalX, absLocalY);
  const axisBalance = dominantAxis > 0 ? secondaryAxis / dominantAxis : 1;
  const bothAxesActive = secondaryAxis >= Math.max(1, handleSize * 0.08);
  const linkedDiagonalAcquireBalance = 0.5;
  const linkedDiagonalHoldBalance = 0.28;
  const hasLinkedDiagonalAcquireIntent =
    nextIntentFamily === "linked" && bothAxesActive && axisBalance >= linkedDiagonalAcquireBalance;
  const hasLinkedDiagonalHoldIntent =
    nextIntentFamily === "linked" && bothAxesActive && axisBalance >= linkedDiagonalHoldBalance;
  const currentLock = currentIntentLock;
  const horizontalAcquireMax = 30;
  const verticalAcquireMin = 60;
  const horizontalReleaseMax = 24;
  const verticalReleaseMin = 66;
  let nextIntentLock: ResizeIntentLock;

  if (nextIntentFamily === "linked") {
    if (currentLock === "diagonal") {
      nextIntentLock = hasLinkedDiagonalHoldIntent ? "diagonal" : angleDegrees < 45 ? "horizontal" : "vertical";
    } else if (currentLock === "horizontal") {
      if (hasLinkedDiagonalAcquireIntent) {
        nextIntentLock = "diagonal";
      } else if (angleDegrees >= verticalAcquireMin) {
        nextIntentLock = "vertical";
      } else {
        nextIntentLock = "horizontal";
      }
    } else if (currentLock === "vertical") {
      if (hasLinkedDiagonalAcquireIntent) {
        nextIntentLock = "diagonal";
      } else if (angleDegrees <= horizontalAcquireMax) {
        nextIntentLock = "horizontal";
      } else {
        nextIntentLock = "vertical";
      }
    } else if (hasLinkedDiagonalAcquireIntent) {
      nextIntentLock = "diagonal";
    } else {
      nextIntentLock = angleDegrees < 45 ? "horizontal" : "vertical";
    }
  } else if (currentLock === "horizontal") {
    if (angleDegrees >= verticalAcquireMin) {
      nextIntentLock = "vertical";
    } else {
      nextIntentLock = "horizontal";
    }
  } else if (currentLock === "vertical") {
    if (angleDegrees <= horizontalAcquireMax) {
      nextIntentLock = "horizontal";
    } else {
      nextIntentLock = "vertical";
    }
  } else if (currentLock === "diagonal") {
    if (angleDegrees <= horizontalReleaseMax) {
      nextIntentLock = "horizontal";
    } else if (angleDegrees >= verticalReleaseMin) {
      nextIntentLock = "vertical";
    } else {
      nextIntentLock = angleDegrees < 45 ? "horizontal" : "vertical";
    }
  } else if (angleDegrees <= horizontalAcquireMax) {
    nextIntentLock = "horizontal";
  } else if (angleDegrees >= verticalAcquireMin) {
    nextIntentLock = "vertical";
  } else {
    nextIntentLock = angleDegrees < 45 ? "horizontal" : "vertical";
  }

  const nextResponse = applyBitmapCornerResizeIntentLock(handle, previewDeltaX, previewDeltaY, nextIntentLock);
  const shouldRebaseSegment =
    currentLock != null &&
    (nextIntentLock !== currentLock ||
      (currentLock === "diagonal" && currentIntentFamily != null && nextIntentFamily !== currentIntentFamily));

  return {
    ...nextResponse,
    intentFamily: nextIntentFamily,
    shouldRebaseSegment,
  };
};

const resolveBitmapResizeRectFromInteraction = (
  interaction: BitmapResizeInteractionState,
  handle: ResizeHandle,
  deltaX: number,
  deltaY: number,
  minWidth: number,
  minHeight: number,
) => {
  const relativeRect = resolveResizedRectFromHandle(
    getBitmapResizeInteractionStartRect(interaction),
    handle,
    deltaX,
    deltaY,
    minWidth,
    minHeight,
  );

  return anchorRotatedBitmapResizeRect(interaction, handle, {
    ...relativeRect,
    // `resolveResizedRectFromHandle` reports flips relative to the current drag baseline.
    // Bitmap selections keep absolute flip parity in interaction state, so preserve it here.
    flipX: interaction.startFlipX !== relativeRect.flipX,
    flipY: interaction.startFlipY !== relativeRect.flipY,
  });
};

const isBitmapResizePinnedToMinimumSize = (
  interaction: BitmapResizeInteractionState,
  handle: ResizeHandle,
  deltaX: number,
  deltaY: number,
  minWidth: number,
  minHeight: number,
) => {
  const startBounds = getBitmapResizeInteractionStartRect(interaction);
  const startRight = startBounds.x + startBounds.width;
  const startBottom = startBounds.y + startBounds.height;
  let left = startBounds.x;
  let right = startRight;
  let top = startBounds.y;
  let bottom = startBottom;

  if (handle.includes("w")) {
    left = startBounds.x + deltaX;
  }
  if (handle.includes("e")) {
    right = startRight + deltaX;
  }
  if (handle.includes("n")) {
    top = startBounds.y + deltaY;
  }
  if (handle.includes("s")) {
    bottom = startBottom + deltaY;
  }

  return Math.abs(right - left) < minWidth || Math.abs(bottom - top) < minHeight;
};

const resolveResizedRectFromHandle = (
  startBounds: RectBounds,
  handle: ResizeHandle,
  deltaX: number,
  deltaY: number,
  minWidth: number,
  minHeight: number,
): ResolvedResizeRect => {
  const startRight = startBounds.x + startBounds.width;
  const startBottom = startBounds.y + startBounds.height;

  let left = startBounds.x;
  let right = startRight;
  let top = startBounds.y;
  let bottom = startBottom;

  if (handle.includes("w")) {
    left = startBounds.x + deltaX;
  }
  if (handle.includes("e")) {
    right = startRight + deltaX;
  }
  if (handle.includes("n")) {
    top = startBounds.y + deltaY;
  }
  if (handle.includes("s")) {
    bottom = startBottom + deltaY;
  }

  const horizontalDirection = right >= left ? 1 : -1;
  const verticalDirection = bottom >= top ? 1 : -1;
  const currentWidth = Math.abs(right - left);
  const currentHeight = Math.abs(bottom - top);

  if (currentWidth < minWidth) {
    if (handle.includes("w") && !handle.includes("e")) {
      left = right - horizontalDirection * minWidth;
    } else if (handle.includes("e") && !handle.includes("w")) {
      right = left + horizontalDirection * minWidth;
    }
  }

  if (currentHeight < minHeight) {
    if (handle.includes("n") && !handle.includes("s")) {
      top = bottom - verticalDirection * minHeight;
    } else if (handle.includes("s") && !handle.includes("n")) {
      bottom = top + verticalDirection * minHeight;
    }
  }

  return {
    x: Math.min(left, right),
    y: Math.min(top, bottom),
    width: Math.max(minWidth, Math.abs(right - left)),
    height: Math.max(minHeight, Math.abs(bottom - top)),
    flipX: right < left,
    flipY: bottom < top,
  };
};

type RotationValueFieldProps = {
  value: number;
  onCommit: (rotation: number) => void;
};

const RotationValueField = ({ value, onCommit }: RotationValueFieldProps) => {
  const [inputValue, setInputValue] = useState(() => formatRotationDisplayValue(value));

  useEffect(() => {
    setInputValue(formatRotationDisplayValue(value));
  }, [value]);

  const commitInputValue = useCallback(
    (rawValue: string) => {
      const trimmedValue = rawValue.trim();
      if (trimmedValue.length === 0) {
        setInputValue(formatRotationDisplayValue(value));
        return;
      }

      const parsedValue = Number(trimmedValue);
      if (!Number.isFinite(parsedValue)) {
        setInputValue(formatRotationDisplayValue(value));
        return;
      }

      const normalizedValue = normalizeContinuousRotation(parsedValue);
      onCommit(normalizedValue);
      setInputValue(formatRotationDisplayValue(normalizedValue));
    },
    [onCommit, value],
  );

  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 8, color: "rgba(255,255,255,0.76)", fontSize: 12 }}>
      Rotation
      <input
        type="text"
        inputMode="decimal"
        value={inputValue}
        onChange={(e) => {
          const nextValue = e.target.value;
          setInputValue(nextValue);
          const parsedValue = Number(nextValue);
          if (nextValue.trim().length > 0 && Number.isFinite(parsedValue)) {
            onCommit(normalizeContinuousRotation(parsedValue));
          }
        }}
        onBlur={() => commitInputValue(inputValue)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitInputValue(inputValue);
          }
        }}
        style={{
          width: 120,
          padding: "8px 10px",
          borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.04)",
          color: "rgba(255,255,255,0.88)",
          fontSize: 12,
        }}
      />
    </label>
  );
};

const findOpaqueImageDataBounds = (bitmap: ImageData | null) => {
  if (!bitmap) return null;

  let minX = bitmap.width;
  let minY = bitmap.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < bitmap.height; y += 1) {
    for (let x = 0; x < bitmap.width; x += 1) {
      const alpha = bitmap.data[(y * bitmap.width + x) * 4 + 3];
      if (alpha <= MOTION_TWEEN_DEBUG_ALPHA_THRESHOLD) {
        continue;
      }

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) {
    return null;
  }

  return {
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
};

export const DrawingCanvas = forwardRef<DrawingCanvasHandle, DrawingCanvasProps>(function DrawingCanvas({
  activeTool,
  onToolSelect,
  editingContextKey,
  isTimelinePlaying,
  playbackRenderScale = 1,
  brushSize,
  eraserSize,
  fillColor,
  shapeType,
  activeTextObjects,
  canEditTextInCurrentFrame,
  onBrushSizeChange,
  onEraserSizeChange,
  onFillColorChange,
  onShapeTypeChange,
  onTextObjectsChange,
  workspaceContext = null,
  projectAiMemory = null,
  onProjectAiMemoryChange,
  onApplyGeneratedFrame,
  onExecuteActionPlan,
  onAuthoringActionCommitted,
}: DrawingCanvasProps, ref) {
  void onToolSelect;
  const DEFAULT_CAMERA_ZOOM = 0.85;
  const DEFAULT_CAMERA_PAN = { x: 0, y: 0 };
  const MIN_CAMERA_ZOOM = 0.5;
  const MAX_CAMERA_ZOOM = 3;
  const PAN_BASE_LIMIT_FACTOR = 0.65;
  const AUTHORING_WORLD_SCALE = (1 + PAN_BASE_LIMIT_FACTOR * 2) / MIN_CAMERA_ZOOM;
  const CAMERA_FRAME_SIZE_PERCENT = (1 / AUTHORING_WORLD_SCALE) * 100;
  const CAMERA_FRAME_INSET_PERCENT = ((AUTHORING_WORLD_SCALE - 1) / AUTHORING_WORLD_SCALE / 2) * 100;
  const LASSO_MIN_POINT_DISTANCE = 1.5;
  const LASSO_DESELECT_DRAG_THRESHOLD = 3;
  const LASSO_RESIZE_HANDLE_SIZE = 12;
  const BITMAP_CORNER_INTENT_WINDOW_PX = 16;
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const backgroundCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const onionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const foregroundCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lassoOverlayRef = useRef<HTMLCanvasElement | null>(null);
  const onionBitmapWorkCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const onionOverlayContentRef = useRef<{
    previousBitmap: ImageData | null;
    nextBitmap: ImageData | null;
    previousTextObjects: DrawingTextObject[];
    nextTextObjects: DrawingTextObject[];
  }>({
    previousBitmap: null,
    nextBitmap: null,
    previousTextObjects: EMPTY_ONION_TEXT_OBJECTS,
    nextTextObjects: EMPTY_ONION_TEXT_OBJECTS,
  });
  const playbackCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const authoringMetricsRef = useRef<{
    hostRect: DOMRect;
    worldWidth: number;
    worldHeight: number;
    worldCenterX: number;
    worldCenterY: number;
    stageOffsetX: number;
    stageOffsetY: number;
    scaleX: number;
    scaleY: number;
    canvasWidth: number;
    canvasHeight: number;
  } | null>(null);
  const assetInputRef = useRef<HTMLInputElement | null>(null);
  const assetPreviewUrlsRef = useRef<string[]>([]);
  const symbolPreviewUrlsRef = useRef<string[]>([]);
  const importedAssetsRef = useRef<ImportedAsset[]>([]);
  const librarySymbolsRef = useRef<LibrarySymbol[]>([]);
  const pendingAssetImportNamesRef = useRef<Set<string>>(new Set());
  const activePlacedImageAssetRef = useRef<ActivePlacedImageAsset | null>(null);
  const activePlacedImageSourceRef = useRef<DrawableImageSource | null>(null);
  const placedImageInteractionRef = useRef<PlacedImageInteractionState>(null);
  const dismissBoxSelectionRef = useRef<() => void>(() => {});
  const bitmapSelectionSessionRef = useRef<BitmapSelectionSession | null>(null);
  const bitmapSelectionInteractionRef = useRef<BitmapSelectionInteractionState>(null);
  const bitmapSelectionBackdropCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bitmapSelectionBackdropRestoreFrameRef = useRef<number | null>(null);
  const restoreBitmapSelectionBackdropToCanvasRef = useRef<() => boolean>(() => false);
  const commitActiveBitmapSelectionSessionRef = useRef<
    (options?: { clearSelection?: boolean; commitHistory?: boolean }) => boolean
  >(() => true);
  const nextBitmapSelectionItemIdRef = useRef(1);
  const boxSelectionSourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const opaqueSelectionMaskCacheRef = useRef(new WeakMap<HTMLCanvasElement, HTMLCanvasElement>());
  const activeBoxSelectionRef = useRef<ActiveBoxSelection | null>(null);
  const nextSymbolNumberRef = useRef(1);
  const isDrawingRef = useRef(false);
  const isShapeDrawingRef = useRef(false);
  const shapeDraftRef = useRef<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
  const shapeDraftBaseImageRef = useRef<ImageData | null>(null);
  const lassoInteractionRef = useRef<LassoInteractionState | null>(null);
  const selectionSourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lassoPathRef = useRef<LassoPoint[]>([]);
  const activeLassoSelectionRef = useRef<ActiveLassoSelection | null>(null);
  const textInteractionRef = useRef<TextInteractionState>(null);
  const selectedTextObjectIdRef = useRef<string | null>(null);
  const textDraftObjectsRef = useRef<DrawingTextObject[] | null>(null);
  const knifeInteractionRef = useRef<KnifeInteractionState | null>(null);
  const activeKnifePieceIdRef = useRef<string | null>(null);
  const knifePiecesSourceRef = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const knifePiecesRef = useRef<ActiveKnifePiece[]>([]);
  const knifePathRef = useRef<LassoPoint[]>([]);
  const brushPreviousPointRef = useRef<CanvasPoint | null>(null);
  const brushDidMoveRef = useRef(false);
  const brushStrokePointsRef = useRef<CanvasPoint[]>([]);
  const brushStrokeBaseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const brushStrokeBaseRectRef = useRef<{ left: number; top: number; width: number; height: number } | null>(null);
  const brushStrokeSmoothedPointsRef = useRef<CanvasPoint[]>([]);
  const brushStrokeRenderPointsRef = useRef<CanvasPoint[]>([]);
  const brushStrokeProcessedPointCountRef = useRef(0);
  const brushStrokeGlowPathStepRef = useRef(1);
  const brushStrokeStartupPreviewBudgetRef = useRef(0);
  const brushUsesBufferedPreviewRef = useRef(true);
  const brushUsesOverlayPreviewRef = useRef(false);
  const brushPreviewOverlayDirtyRectRef = useRef<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const brushStrokeColorRef = useRef("#000000");
  const brushStrokeSizeRef = useRef(1);
  const brushStrokeSmoothingRef = useRef(0);
  const brushStrokeGradientBrightnessRef = useRef(60);
  const brushStrokeGradientRadiusRef = useRef(40);
  const brushStrokeVariantRef = useRef<BrushToolVariant>("Brush");
  const brushPreviewFrameRef = useRef<number | null>(null);
  const shapePreviewFrameRef = useRef<number | null>(null);
  const isPanningRef = useRef(false);
  const hasPendingAuthoringChangesRef = useRef(false);
  const authoringCommittedBitmapRef = useRef<ImageData | null>(null);
  const authoringDirtyRectRef = useRef<CanvasDirtyRect | null>(null);
  const authoringDirtyCaptureModeRef = useRef<"region" | "full">("full");
  const authoringChangeVersionRef = useRef(0);
  const authoringSnapshotReadbackWarmRef = useRef(false);
  const lastAuthoringInteractionAtRef = useRef(0);
  const panStartRef = useRef<{ pointerX: number; pointerY: number; startPanX: number; startPanY: number } | null>(null);
  const previousActiveToolRef = useRef<DrawingToolName>(activeTool);
  const previousEditingContextKeyRef = useRef(editingContextKey);
  const playbackOverlayDebugLoggedRef = useRef(false);
  const [cameraZoom, setCameraZoom] = useState(DEFAULT_CAMERA_ZOOM);
  const [cameraPan, setCameraPan] = useState(DEFAULT_CAMERA_PAN);
  const [isPanning, setIsPanning] = useState(false);
  const [zoomInputValue, setZoomInputValue] = useState(`${Math.round(DEFAULT_CAMERA_ZOOM * 100)}%`);
  const [canvasMovementEnabled, setCanvasMovementEnabled] = useState(false);
  const [canvasBackgroundColor, setCanvasBackgroundColor] = useState("#f5f5f5");
  const [rightPanelTab, setRightPanelTab] = useState<DrawingRightPanelTab>("Properties");
  const [importedAssets, setImportedAssets] = useState<ImportedAsset[]>([]);
  const [librarySymbols, setLibrarySymbols] = useState<LibrarySymbol[]>([]);
  const [activePlacedImageAsset, setActivePlacedImageAsset] = useState<ActivePlacedImageAsset | null>(null);
  const [activeBitmapSelectionSession, setActiveBitmapSelectionSession] = useState<BitmapSelectionSession | null>(null);
  const [selectionBoxDraft, setSelectionBoxDraft] = useState<SelectionBoxDraft | null>(null);
  const [activeBoxSelection, setActiveBoxSelection] = useState<ActiveBoxSelection | null>(null);
  const [fillTolerance, setFillTolerance] = useState(20);
  const [brushTransparency, setBrushTransparency] = useState(0);
  const [brushSmoothing, setBrushSmoothing] = useState(0);
  const [glowGradientBrightness, setGlowGradientBrightness] = useState(60);
  const [glowGradientRadius, setGlowGradientRadius] = useState(40);
  const [shapeMode, setShapeMode] = useState<"Draw" | "Cutout">("Draw");
  const [shapeFillColor, setShapeFillColor] = useState("#ffffff");
  const [shapeOutlineColor, setShapeOutlineColor] = useState("#000000");
  const [shapeOutlineThickness, setShapeOutlineThickness] = useState(20);
  const [shapeCornerRadius, setShapeCornerRadius] = useState(15);
  const [knifeStraightLine, setKnifeStraightLine] = useState(false);
  const [knifeSmoothing, setKnifeSmoothing] = useState(50);
  const [brushColor, setBrushColor] = useState("#000000");
  const [brushToolVariant, setBrushToolVariant] = useState<BrushToolVariant>("Brush");
  const [brushToolsMenuOpen, setBrushToolsMenuOpen] = useState(false);
  const [lassoPath, setLassoPath] = useState<LassoPoint[]>([]);
  const [activeLassoSelection, setActiveLassoSelection] = useState<ActiveLassoSelection | null>(null);
  const [selectedTextObjectId, setSelectedTextObjectId] = useState<string | null>(null);
  const [textDraftObjects, setTextDraftObjects] = useState<DrawingTextObject[] | null>(null);
  const [pendingTextSelection, setPendingTextSelection] = useState<PendingTextSelection>(null);
  const [knifePath, setKnifePath] = useState<LassoPoint[]>([]);
  const [activeKnifePieces, setActiveKnifePieces] = useState<ActiveKnifePiece[]>([]);
  const [activeKnifePieceId, setActiveKnifePieceId] = useState<string | null>(null);
  const rightPanelRef = useRef<HTMLDivElement | null>(null);
  const rightPanelTabsRef = useRef<HTMLDivElement | null>(null);
  const brushToolsButtonRef = useRef<HTMLButtonElement | null>(null);
  const brushToolsMenuRef = useRef<HTMLDivElement | null>(null);
  const [brushToolsMenuPosition, setBrushToolsMenuPosition] = useState<{ left: number; width: number; top: number } | null>(null);
  const [onionOverlayVersion, setOnionOverlayVersion] = useState(0);

  const invalidateAuthoringMetrics = useCallback(() => {
    authoringMetricsRef.current = null;
  }, []);

  const setOnionOverlayContent = useCallback((content: {
    previousBitmap: ImageData | null;
    nextBitmap: ImageData | null;
    previousTextObjects: DrawingTextObject[];
    nextTextObjects: DrawingTextObject[];
  }) => {
    const current = onionOverlayContentRef.current;
    if (
      current.previousBitmap === content.previousBitmap &&
      current.nextBitmap === content.nextBitmap &&
      current.previousTextObjects === content.previousTextObjects &&
      current.nextTextObjects === content.nextTextObjects
    ) {
      return;
    }

    onionOverlayContentRef.current = {
      previousBitmap: content.previousBitmap,
      nextBitmap: content.nextBitmap,
      previousTextObjects: content.previousTextObjects,
      nextTextObjects: content.nextTextObjects,
    };
    setOnionOverlayVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    const host = canvasHostRef.current;
    const backgroundCanvas = backgroundCanvasRef.current;
    const onionCanvas = onionCanvasRef.current;
    const canvas = canvasRef.current;
    const textCanvas = textCanvasRef.current;
    const foregroundCanvas = foregroundCanvasRef.current;
    const overlayCanvas = lassoOverlayRef.current;
    if (!host || !canvas || !backgroundCanvas || !onionCanvas || !textCanvas || !foregroundCanvas || !overlayCanvas) return;

    const resizeAuthoringCanvases = () => {
      const rect = host.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.floor(rect.width * AUTHORING_WORLD_SCALE * dpr));
      const height = Math.max(1, Math.floor(rect.height * AUTHORING_WORLD_SCALE * dpr));
      invalidateAuthoringMetrics();

      for (const targetCanvas of [backgroundCanvas, onionCanvas, canvas, textCanvas, foregroundCanvas, overlayCanvas]) {
        const targetCtx =
          targetCanvas === canvas
            ? targetCanvas.getContext("2d", { desynchronized: true }) ?? targetCanvas.getContext("2d")
            : targetCanvas.getContext("2d");
        if (!targetCtx) continue;

        targetCanvas.width = width;
        targetCanvas.height = height;
        targetCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        targetCtx.lineCap = "round";
        targetCtx.lineJoin = "round";
        targetCtx.strokeStyle = "#000000";
      }
    };

    resizeAuthoringCanvases();
    window.addEventListener("resize", resizeAuthoringCanvases);
    return () => window.removeEventListener("resize", resizeAuthoringCanvases);
  }, [AUTHORING_WORLD_SCALE, invalidateAuthoringMetrics]);

  useEffect(() => {
    const host = canvasHostRef.current;
    const playbackCanvas = playbackCanvasRef.current;
    if (!host || !playbackCanvas) return;

    const resizePlaybackCanvas = () => {
      const rect = host.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const playbackScale = Math.min(1, Math.max(0.5, playbackRenderScale));
      const playbackDpr = Math.max(1, dpr * playbackScale);
      const playbackWidth = Math.max(1, Math.floor(rect.width * playbackDpr));
      const playbackHeight = Math.max(1, Math.floor(rect.height * playbackDpr));
      const playbackCtx = playbackCanvas.getContext("2d");
      if (!playbackCtx) {
        return;
      }

      playbackCanvas.width = playbackWidth;
      playbackCanvas.height = playbackHeight;
      playbackCtx.setTransform(playbackDpr, 0, 0, playbackDpr, 0, 0);
      playbackCtx.lineCap = "round";
      playbackCtx.lineJoin = "round";
      playbackCtx.strokeStyle = "#000000";
    };

    resizePlaybackCanvas();
    window.addEventListener("resize", resizePlaybackCanvas);
    return () => window.removeEventListener("resize", resizePlaybackCanvas);
  }, [playbackRenderScale]);

  useEffect(() => {
    const handleLayoutChange = () => {
      invalidateAuthoringMetrics();
    };

    window.addEventListener("scroll", handleLayoutChange, true);
    window.addEventListener("resize", handleLayoutChange);
    return () => {
      window.removeEventListener("scroll", handleLayoutChange, true);
      window.removeEventListener("resize", handleLayoutChange);
    };
  }, [invalidateAuthoringMetrics]);

  useEffect(() => {
    if (authoringSnapshotReadbackWarmRef.current) {
      return;
    }

    let frameHandle: number | null = null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    const warmReadback = () => {
      if (authoringSnapshotReadbackWarmRef.current) {
        return;
      }

      const canvas = canvasRef.current;
      const ctx =
        canvas?.getContext("2d", { willReadFrequently: true }) ??
        canvas?.getContext("2d");
      if (!canvas || !ctx) {
        return;
      }

      try {
        const sampleWidth = canvas.width;
        const sampleHeight = canvas.height;
        ctx.getImageData(0, 0, sampleWidth, sampleHeight);
        authoringSnapshotReadbackWarmRef.current = true;
      } catch {
        // Ignore warm-up failures and fall back to normal capture behavior.
      }
    };

    frameHandle = window.requestAnimationFrame(() => {
      timeoutHandle = setTimeout(warmReadback, 0);
    });

    return () => {
      if (frameHandle !== null) {
        window.cancelAnimationFrame(frameHandle);
      }
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle);
      }
    };
  }, []);

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const getAuthoringMetrics = useCallback(() => {
    const host = canvasHostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return null;

    const cachedMetrics = authoringMetricsRef.current;
    if (cachedMetrics && cachedMetrics.canvasWidth === canvas.width && cachedMetrics.canvasHeight === canvas.height) {
      return cachedMetrics;
    }

    const hostRect = host.getBoundingClientRect();
    const worldWidth = hostRect.width * AUTHORING_WORLD_SCALE;
    const worldHeight = hostRect.height * AUTHORING_WORLD_SCALE;
    const stageOffsetX = (worldWidth - hostRect.width) / 2;
    const stageOffsetY = (worldHeight - hostRect.height) / 2;

    const nextMetrics = {
      hostRect,
      worldWidth,
      worldHeight,
      worldCenterX: worldWidth / 2,
      worldCenterY: worldHeight / 2,
      stageOffsetX,
      stageOffsetY,
      scaleX: canvas.width / worldWidth,
      scaleY: canvas.height / worldHeight,
    };
    authoringMetricsRef.current = {
      ...nextMetrics,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
    };
    return authoringMetricsRef.current;
  }, [AUTHORING_WORLD_SCALE]);

  const getPlaybackSurfaceLayout = useCallback((): DrawingCanvasPlaybackSurfaceLayout | null => {
    const host = canvasHostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) {
      return null;
    }

    const hostRect = host.getBoundingClientRect();
    return {
      drawingCanvasWidth: canvas.width,
      drawingCanvasHeight: canvas.height,
      worldWidth: hostRect.width * AUTHORING_WORLD_SCALE,
      worldHeight: hostRect.height * AUTHORING_WORLD_SCALE,
      worldDisplayRect: {
        left: ((1 - AUTHORING_WORLD_SCALE) / 2) * hostRect.width,
        top: ((1 - AUTHORING_WORLD_SCALE) / 2) * hostRect.height,
        width: AUTHORING_WORLD_SCALE * hostRect.width,
        height: AUTHORING_WORLD_SCALE * hostRect.height,
      },
      stageDisplayRect: {
        left: 0,
        top: 0,
        width: hostRect.width,
        height: hostRect.height,
      },
    };
  }, [AUTHORING_WORLD_SCALE]);

  const clampPan = (pan: { x: number; y: number }, zoom: number) => {
    const host = canvasHostRef.current;
    if (!host) return pan;
    const rect = host.getBoundingClientRect();
    const zoomOverflowX = Math.max(0, (rect.width * zoom - rect.width) / 2);
    const zoomOverflowY = Math.max(0, (rect.height * zoom - rect.height) / 2);
    const panLimitX = zoomOverflowX + rect.width * PAN_BASE_LIMIT_FACTOR;
    const panLimitY = zoomOverflowY + rect.height * PAN_BASE_LIMIT_FACTOR;
    return {
      x: clamp(pan.x, -panLimitX, panLimitX),
      y: clamp(pan.y, -panLimitY, panLimitY),
    };
  };

  useEffect(() => {
    setZoomInputValue(`${Math.round(cameraZoom * 100)}%`);
  }, [cameraZoom]);

  useEffect(() => {
    return () => {
      assetPreviewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      assetPreviewUrlsRef.current = [];
      symbolPreviewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      symbolPreviewUrlsRef.current = [];
    };
  }, []);

  useEffect(() => {
    importedAssetsRef.current = importedAssets;
  }, [importedAssets]);

  useEffect(() => {
    librarySymbolsRef.current = librarySymbols;
  }, [librarySymbols]);

  useEffect(() => {
    activePlacedImageAssetRef.current = activePlacedImageAsset;
  }, [activePlacedImageAsset]);

  useEffect(() => {
    if (activeBoxSelection) {
      setRightPanelTab("Properties");
    }
  }, [activeBoxSelection]);

  useEffect(() => {
    lassoPathRef.current = lassoPath;
  }, [lassoPath]);

  const createBitmapSelectionSessionItemId = useCallback(() => `${nextBitmapSelectionItemIdRef.current++}`, []);

  const setActiveKnifePieceIdState = useCallback((itemId: string | null) => {
    activeKnifePieceIdRef.current = itemId;
    setActiveKnifePieceId(itemId);
  }, []);

  const toBitmapTransformSelection = useCallback((item: BitmapSelectionSessionItem): ActiveBitmapTransformSelection => ({
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height,
    flipX: item.flipX,
    flipY: item.flipY,
    rotation: item.rotation,
  }), []);

  const projectBitmapSelectionSessionToViews = useCallback((session: BitmapSelectionSession | null) => {
    bitmapSelectionSessionRef.current = session;
    setActiveBitmapSelectionSession(session);

    const boxItem = session?.owner === "select" ? session.items[0] ?? null : null;
    boxSelectionSourceCanvasRef.current = boxItem ? boxItem.sourceCanvas : null;
    if (boxItem) {
      const nextBoxSelection: ActiveBoxBitmapSelection = {
        kind: "bitmap",
        ...toBitmapTransformSelection(boxItem),
      };
      activeBoxSelectionRef.current = nextBoxSelection;
      setActiveBoxSelection(nextBoxSelection);
    } else if (activeBoxSelectionRef.current?.kind === "bitmap") {
      activeBoxSelectionRef.current = null;
      setActiveBoxSelection(null);
    }

    const lassoItem = session?.owner === "lasso" ? session.items[0] ?? null : null;
    selectionSourceCanvasRef.current = lassoItem ? lassoItem.sourceCanvas : null;
    if (lassoItem) {
      const nextLassoSelection: ActiveLassoBitmapSelection = {
        kind: "bitmap",
        ...toBitmapTransformSelection(lassoItem),
      };
      activeLassoSelectionRef.current = nextLassoSelection;
      setActiveLassoSelection(nextLassoSelection);
    } else if (activeLassoSelectionRef.current?.kind === "bitmap") {
      activeLassoSelectionRef.current = null;
      setActiveLassoSelection(null);
    }

    if (session?.owner === "knife") {
      const nextActiveKnifePieceId =
        session.items.length === 1
          ? session.items[0]?.id ?? null
          : session.items.some((item) => item.id === activeKnifePieceIdRef.current)
            ? activeKnifePieceIdRef.current
            : null;
      setActiveKnifePieceIdState(nextActiveKnifePieceId);
      const nextKnifePieces = session.items.map((item, index) => ({
        id: Number(item.id) || index + 1,
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        flipX: item.flipX,
        flipY: item.flipY,
      }));
      knifePiecesSourceRef.current = new Map(
        session.items.map((item, index) => [nextKnifePieces[index].id, item.sourceCanvas]),
      );
      knifePiecesRef.current = nextKnifePieces;
      setActiveKnifePieces(nextKnifePieces);
    } else if (knifePiecesRef.current.length > 0 || activeKnifePieceIdRef.current) {
      setActiveKnifePieceIdState(null);
      knifePiecesSourceRef.current.clear();
      knifePiecesRef.current = [];
      setActiveKnifePieces([]);
    }

    if (session?.items.length) {
      setRightPanelTab("Properties");
    }
  }, [setActiveBoxSelection, setActiveKnifePieceIdState, setActiveKnifePieces, setActiveLassoSelection, setRightPanelTab, toBitmapTransformSelection]);

  const setBitmapSelectionSessionState = useCallback((session: BitmapSelectionSession | null) => {
    if (!session?.items.length) {
      bitmapSelectionBackdropCanvasRef.current = null;
      if (bitmapSelectionBackdropRestoreFrameRef.current !== null) {
        window.cancelAnimationFrame(bitmapSelectionBackdropRestoreFrameRef.current);
        bitmapSelectionBackdropRestoreFrameRef.current = null;
      }
    }
    projectBitmapSelectionSessionToViews(session && session.items.length > 0 ? session : null);
  }, [projectBitmapSelectionSessionToViews]);

  const flushBitmapSelectionSessionState = useCallback((session: BitmapSelectionSession | null) => {
    flushSync(() => {
      setBitmapSelectionSessionState(session);
    });
  }, [setBitmapSelectionSessionState]);

  const updateBitmapSelectionSessionState = useCallback(
    (updater: (current: BitmapSelectionSession | null) => BitmapSelectionSession | null) => {
      const nextSession = updater(bitmapSelectionSessionRef.current);
      setBitmapSelectionSessionState(nextSession);
      return nextSession;
    },
    [setBitmapSelectionSessionState],
  );

  const setActiveLassoSelectionState = useCallback((selection: ActiveLassoSelection | null) => {
    activeLassoSelectionRef.current = selection;
    setActiveLassoSelection(selection);
    if (selection) {
      setRightPanelTab("Properties");
    }
  }, [setRightPanelTab]);

  const updateActiveLassoSelectionState = useCallback(
    (updater: (current: ActiveLassoSelection | null) => ActiveLassoSelection | null) => {
      const currentSession = bitmapSelectionSessionRef.current;
      if (currentSession?.owner === "lasso" && currentSession.items[0]) {
        const currentItem = currentSession.items[0];
        const currentSelection: ActiveLassoBitmapSelection = {
          kind: "bitmap",
          ...toBitmapTransformSelection(currentItem),
        };
        const nextSelection = updater(currentSelection);
        if (nextSelection?.kind !== "bitmap") {
          setBitmapSelectionSessionState(null);
          return nextSelection;
        }

        updateBitmapSelectionSessionState((session) => {
          if (!session || session.owner !== "lasso" || !session.items[0]) {
            return session;
          }
          return {
            ...session,
            items: [{
              ...session.items[0],
              ...nextSelection,
            }],
          };
        });
        return nextSelection;
      }

      const nextSelection = updater(activeLassoSelectionRef.current);
      activeLassoSelectionRef.current = nextSelection;
      setActiveLassoSelection(nextSelection);
      if (nextSelection) {
        setRightPanelTab("Properties");
      }
      return nextSelection;
    },
    [setBitmapSelectionSessionState, setRightPanelTab, toBitmapTransformSelection, updateBitmapSelectionSessionState],
  );

  const setActiveBoxSelectionState = useCallback((selection: ActiveBoxSelection | null) => {
    activeBoxSelectionRef.current = selection;
    setActiveBoxSelection(selection);
    if (selection) {
      setRightPanelTab("Properties");
    }
  }, [setRightPanelTab]);

  const updateActiveBoxSelectionState = useCallback(
    (updater: (current: ActiveBoxSelection | null) => ActiveBoxSelection | null) => {
      const currentSession = bitmapSelectionSessionRef.current;
      if (currentSession?.owner === "select" && currentSession.items[0]) {
        const currentItem = currentSession.items[0];
        const currentSelection: ActiveBoxBitmapSelection = {
          kind: "bitmap",
          ...toBitmapTransformSelection(currentItem),
        };
        const nextSelection = updater(currentSelection);
        if (nextSelection?.kind !== "bitmap") {
          setBitmapSelectionSessionState(null);
          return nextSelection;
        }

        updateBitmapSelectionSessionState((session) => {
          if (!session || session.owner !== "select" || !session.items[0]) {
            return session;
          }
          return {
            ...session,
            items: [{
              ...session.items[0],
              ...nextSelection,
            }],
          };
        });
        return nextSelection;
      }

      const nextSelection = updater(activeBoxSelectionRef.current);
      activeBoxSelectionRef.current = nextSelection;
      setActiveBoxSelection(nextSelection);
      if (nextSelection) {
        setRightPanelTab("Properties");
      }
      return nextSelection;
    },
    [setBitmapSelectionSessionState, setRightPanelTab, toBitmapTransformSelection, updateBitmapSelectionSessionState],
  );

  useEffect(() => {
    selectedTextObjectIdRef.current = selectedTextObjectId;
  }, [selectedTextObjectId]);

  useEffect(() => {
    textDraftObjectsRef.current = textDraftObjects;
  }, [textDraftObjects]);

  useEffect(() => {
    if (
      selectedTextObjectId &&
      !pendingTextSelection?.objectIds.includes(selectedTextObjectId) &&
      !activeTextObjects.some((textObject) => textObject.id === selectedTextObjectId)
    ) {
      setSelectedTextObjectId(null);
      setTextDraftObjects(null);
    }
  }, [activeTextObjects, pendingTextSelection, selectedTextObjectId]);

  useEffect(() => {
    knifePathRef.current = knifePath;
  }, [knifePath]);

  const resetBoxSelectionState = useCallback(() => {
    boxSelectionSourceCanvasRef.current = null;
    setSelectionBoxDraft(null);
    setActiveBoxSelectionState(null);
  }, [setActiveBoxSelectionState]);

  const clearBoxSelection = useCallback(() => {
    resetBoxSelectionState();
  }, [resetBoxSelectionState]);

  const clearTextSelectionState = useCallback(() => {
    const clearBoxTextState = activeBoxSelectionRef.current?.kind === "text";
    const clearLassoTextState = activeLassoSelectionRef.current?.kind === "text";
    textInteractionRef.current = null;
    selectedTextObjectIdRef.current = null;
    textDraftObjectsRef.current = null;
    if (clearBoxTextState) {
      boxSelectionSourceCanvasRef.current = null;
    }
    if (clearLassoTextState) {
      selectionSourceCanvasRef.current = null;
    }
    setSelectionBoxDraft(null);
    updateActiveBoxSelectionState((current) => (current?.kind === "text" ? null : current));
    updateActiveLassoSelectionState((current) => (current?.kind === "text" ? null : current));
    setSelectedTextObjectId(null);
    setTextDraftObjects(null);
    setPendingTextSelection(null);
  }, [updateActiveBoxSelectionState, updateActiveLassoSelectionState]);

  useEffect(() => {
    if (activeBoxSelection?.kind !== "text") {
      return;
    }

    const nextObjectIds = activeBoxSelection.objectIds.filter((objectId) =>
      activeTextObjects.some((textObject) => textObject.id === objectId),
    );
    if (nextObjectIds.length === 0) {
      clearBoxSelection();
      return;
    }

    if (nextObjectIds.length !== activeBoxSelection.objectIds.length) {
      setActiveBoxSelectionState({
        kind: "text",
        objectIds: nextObjectIds,
      });
    }
  }, [activeBoxSelection, activeTextObjects, clearBoxSelection, setActiveBoxSelectionState]);

  useEffect(() => {
    if (activeLassoSelection?.kind !== "text") {
      return;
    }

    const nextObjectIds = activeLassoSelection.objectIds.filter((objectId) =>
      activeTextObjects.some((textObject) => textObject.id === objectId),
    );
    if (nextObjectIds.length === 0) {
      selectionSourceCanvasRef.current = null;
      setActiveLassoSelectionState(null);
      return;
    }

    if (nextObjectIds.length !== activeLassoSelection.objectIds.length) {
      setActiveLassoSelectionState({
        kind: "text",
        objectIds: nextObjectIds,
        flipX: false,
        flipY: false,
      });
    }
  }, [activeLassoSelection, activeTextObjects, setActiveLassoSelectionState]);

  useEffect(() => {
    if (previousActiveToolRef.current !== activeTool) {
      setRightPanelTab("Properties");
      previousActiveToolRef.current = activeTool;
    }
  }, [activeTool]);

  useEffect(() => {
    if (activeTool !== "Select") {
      dismissBoxSelectionRef.current();
    }
  }, [activeTool]);

  useEffect(() => {
    const preservesTextSelection =
      activeTool === "Text" ||
      ((activeTool === "Select" || activeTool === "Lasso") &&
        (
          selectedTextObjectId !== null ||
          activeBoxSelection?.kind === "text" ||
          activeLassoSelection?.kind === "text"
        ));

    if (activeTool !== "Text" && !preservesTextSelection) {
      textInteractionRef.current = null;
      setTextDraftObjects(null);
      setSelectedTextObjectId(null);
    }
  }, [activeBoxSelection, activeLassoSelection, activeTool, selectedTextObjectId]);

  useEffect(() => {
    if (activeTool === "Select" && !activeBoxSelection) {
      const sourceIds =
        activeLassoSelection?.kind === "text"
          ? activeLassoSelection.objectIds
          : selectedTextObjectId
            ? [selectedTextObjectId]
            : null;
      if (sourceIds && sourceIds.length > 0) {
        setActiveBoxSelectionState({ kind: "text", objectIds: Array.from(new Set(sourceIds)) });
        if (activeLassoSelection?.kind === "text") {
          setActiveLassoSelectionState(null);
        }
      }
    }

    if (activeTool === "Lasso" && !activeLassoSelection) {
      const sourceIds =
        activeBoxSelection?.kind === "text"
          ? activeBoxSelection.objectIds
          : selectedTextObjectId
            ? [selectedTextObjectId]
            : null;
      if (sourceIds && sourceIds.length > 0) {
        setActiveLassoSelectionState({
          kind: "text",
          objectIds: Array.from(new Set(sourceIds)),
          flipX: false,
          flipY: false,
        });
        if (activeBoxSelection?.kind === "text") {
          clearBoxSelection();
        }
      }
    }
  }, [activeBoxSelection, activeLassoSelection, activeTool, clearBoxSelection, selectedTextObjectId, setActiveBoxSelectionState, setActiveLassoSelectionState]);

  useEffect(() => {
    if (canvasMovementEnabled) {
      dismissBoxSelectionRef.current();
    }
  }, [canvasMovementEnabled]);

  useEffect(() => {
    if (activeTool !== "Brush" && brushToolsMenuOpen) {
      setBrushToolsMenuOpen(false);
    }
  }, [activeTool, brushToolsMenuOpen]);

  useEffect(() => {
    if (rightPanelTab !== "Properties" && brushToolsMenuOpen) {
      setBrushToolsMenuOpen(false);
    }
  }, [rightPanelTab, brushToolsMenuOpen]);

  useLayoutEffect(() => {
    if (!brushToolsMenuOpen || rightPanelTab !== "Properties" || activeTool !== "Brush") {
      setBrushToolsMenuPosition(null);
      return;
    }

    const rightPanel = rightPanelRef.current;
    const button = brushToolsButtonRef.current;
    const menu = brushToolsMenuRef.current;
    if (!rightPanel || !button || !menu) return;

    const updateMenuPosition = () => {
      const panelRect = rightPanel.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      const tabsRect = rightPanelTabsRef.current?.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const margin = 8;
      const tabsBottom = tabsRect ? tabsRect.bottom - panelRect.top : 48;
      const minTop = tabsBottom + margin;
      const preferredTop = buttonRect.top - panelRect.top - menuRect.height - margin;
      const maxTop = panelRect.height - menuRect.height - margin;
      setBrushToolsMenuPosition({
        left: buttonRect.left - panelRect.left,
        width: buttonRect.width,
        top: Math.min(Math.max(minTop, preferredTop), maxTop),
      });
    };

    updateMenuPosition();
    const rafId = window.requestAnimationFrame(updateMenuPosition);
    window.addEventListener("resize", updateMenuPosition);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", updateMenuPosition);
    };
  }, [activeTool, brushToolsMenuOpen, rightPanelTab]);

  const setLassoPathState = useCallback((nextPath: LassoPoint[]) => {
    lassoPathRef.current = nextPath;
    setLassoPath(nextPath);
  }, []);

  const setKnifePathState = useCallback((nextPath: LassoPoint[]) => {
    knifePathRef.current = nextPath;
    setKnifePath(nextPath);
  }, []);

  const clearBrushPreviewOverlay = useCallback(
    (
      dirtyRect?: {
        left: number;
        top: number;
        width: number;
        height: number;
      } | null,
    ) => {
      const overlayCanvas = foregroundCanvasRef.current;
      const overlayCtx = overlayCanvas?.getContext("2d");
      if (!overlayCanvas || !overlayCtx) {
        brushPreviewOverlayDirtyRectRef.current = null;
        return;
      }

      const rect = dirtyRect ?? brushPreviewOverlayDirtyRectRef.current;
      overlayCtx.save();
      overlayCtx.setTransform(1, 0, 0, 1, 0, 0);
      if (rect) {
        overlayCtx.clearRect(rect.left, rect.top, rect.width, rect.height);
      } else {
        overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
      }
      overlayCtx.restore();
      brushPreviewOverlayDirtyRectRef.current = null;
    },
    [],
  );

  const clearLassoDraft = useCallback(() => {
    lassoInteractionRef.current = null;
    setLassoPathState([]);
  }, [setLassoPathState]);

  const clearKnifeDraft = useCallback(() => {
    knifeInteractionRef.current = null;
    setKnifePathState([]);
  }, [setKnifePathState]);

  const clearKnifePieceSelectionState = useCallback(() => {
    if (bitmapSelectionSessionRef.current?.owner === "knife") {
      setBitmapSelectionSessionState(null);
    }
    setActiveKnifePieceIdState(null);
    knifePiecesRef.current = [];
    knifePiecesSourceRef.current.clear();
    setActiveKnifePieces([]);
    clearKnifeDraft();
  }, [clearKnifeDraft, setActiveKnifePieceIdState, setBitmapSelectionSessionState]);

  const resetBrushStrokePreviewState = useCallback(() => {
    clearBrushPreviewOverlay();
    brushStrokePointsRef.current = [];
    brushStrokeBaseCanvasRef.current = null;
    brushStrokeBaseRectRef.current = null;
    brushStrokeSmoothedPointsRef.current = [];
    brushStrokeRenderPointsRef.current = [];
    brushStrokeProcessedPointCountRef.current = 0;
    brushStrokeGlowPathStepRef.current = 1;
    brushStrokeStartupPreviewBudgetRef.current = 0;
    brushUsesOverlayPreviewRef.current = false;
  }, [clearBrushPreviewOverlay]);

  const clearTransientEditingState = useCallback(() => {
    if (brushPreviewFrameRef.current !== null) {
      window.cancelAnimationFrame(brushPreviewFrameRef.current);
      brushPreviewFrameRef.current = null;
    }
    if (shapePreviewFrameRef.current !== null) {
      window.cancelAnimationFrame(shapePreviewFrameRef.current);
      shapePreviewFrameRef.current = null;
    }
    isDrawingRef.current = false;
    isShapeDrawingRef.current = false;
    shapeDraftRef.current = null;
    shapeDraftBaseImageRef.current = null;
    brushPreviousPointRef.current = null;
    brushDidMoveRef.current = false;
    resetBrushStrokePreviewState();
    brushUsesBufferedPreviewRef.current = true;

    activePlacedImageSourceRef.current = null;
    placedImageInteractionRef.current = null;
    setActivePlacedImageAsset(null);

    commitActiveBitmapSelectionSessionRef.current({ clearSelection: true, commitHistory: false });

    selectionSourceCanvasRef.current = null;
    setActiveLassoSelectionState(null);
    clearLassoDraft();

    textInteractionRef.current = null;
    selectedTextObjectIdRef.current = null;
    textDraftObjectsRef.current = null;
    setSelectedTextObjectId(null);
    setTextDraftObjects(null);
    setPendingTextSelection(null);

    clearKnifePieceSelectionState();

    dismissBoxSelectionRef.current();
  }, [clearKnifePieceSelectionState, clearLassoDraft, resetBrushStrokePreviewState, setActiveLassoSelectionState]);

  const noteAuthoringInteraction = useCallback(() => {
    lastAuthoringInteractionAtRef.current = performance.now();
  }, []);

  const recordAuthoringDirtyRegion = useCallback(
    (
      dirtyRect: CanvasDirtyRect | null,
      options?: { markPending?: boolean; requireFullSnapshot?: boolean },
    ) => {
      noteAuthoringInteraction();

      if (options?.markPending) {
        hasPendingAuthoringChangesRef.current = true;
      }

      authoringChangeVersionRef.current += 1;

      if (options?.requireFullSnapshot || !dirtyRect) {
        authoringDirtyCaptureModeRef.current = "full";
        authoringDirtyRectRef.current = null;
        return;
      }

      if (authoringDirtyCaptureModeRef.current === "full") {
        return;
      }

      const existingRect = authoringDirtyRectRef.current;
      if (!existingRect) {
        authoringDirtyRectRef.current = dirtyRect;
        return;
      }

      const canvas = canvasRef.current;
      const canvasWidth = canvas?.width ?? dirtyRect.left + dirtyRect.width;
      const canvasHeight = canvas?.height ?? dirtyRect.top + dirtyRect.height;
      const mergedLeft = Math.max(0, Math.min(existingRect.left, dirtyRect.left));
      const mergedTop = Math.max(0, Math.min(existingRect.top, dirtyRect.top));
      const mergedRight = Math.min(
        canvasWidth,
        Math.max(existingRect.left + existingRect.width, dirtyRect.left + dirtyRect.width),
      );
      const mergedBottom = Math.min(
        canvasHeight,
        Math.max(existingRect.top + existingRect.height, dirtyRect.top + dirtyRect.height),
      );

      authoringDirtyRectRef.current = {
        left: mergedLeft,
        top: mergedTop,
        width: Math.max(1, mergedRight - mergedLeft),
        height: Math.max(1, mergedBottom - mergedTop),
      };
    },
    [noteAuthoringInteraction],
  );

  const markAuthoringPendingChanges = useCallback(() => {
    noteAuthoringInteraction();
    hasPendingAuthoringChangesRef.current = true;
  }, [noteAuthoringInteraction]);

  const markAuthoringDirtyRegion = useCallback(
    (dirtyRect: CanvasDirtyRect | null, markPending = false) => {
      recordAuthoringDirtyRegion(dirtyRect, { markPending, requireFullSnapshot: false });
    },
    [recordAuthoringDirtyRegion],
  );

  const markAuthoringDirty = useCallback(() => {
    recordAuthoringDirtyRegion(null, { markPending: true, requireFullSnapshot: true });
  }, [recordAuthoringDirtyRegion]);

  const hasPendingAuthoringChanges = useCallback(() => hasPendingAuthoringChangesRef.current, []);

  const shouldDeferAuthoringSnapshotCapture = useCallback((minimumIdleMs = AUTHORING_SNAPSHOT_SETTLE_MS) => {
    if (isDrawingRef.current || isShapeDrawingRef.current) {
      return true;
    }

    if (brushPreviewFrameRef.current !== null || shapePreviewFrameRef.current !== null) {
      return true;
    }

    const lastInteractionAt = lastAuthoringInteractionAtRef.current;
    if (lastInteractionAt <= 0) {
      return false;
    }

    return performance.now() - lastInteractionAt < minimumIdleMs;
  }, []);

  const markAuthoringChangesCommitted = useCallback((committedBitmap?: ImageData | null, captureVersion?: number | null) => {
    if (captureVersion != null && captureVersion !== authoringChangeVersionRef.current) {
      return;
    }

    hasPendingAuthoringChangesRef.current = false;
    authoringDirtyRectRef.current = null;
    authoringDirtyCaptureModeRef.current = "region";
    if (committedBitmap !== undefined) {
      authoringCommittedBitmapRef.current = committedBitmap ?? null;
    }
  }, []);

  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    return getCanvasPointFromClient(e.clientX, e.clientY);
  };

  const getCanvasPointFromClient = useCallback(
    (clientX: number, clientY: number) => {
      const metrics = getAuthoringMetrics();
      if (!metrics) return null;

      const hostX = clientX - metrics.hostRect.left;
      const hostY = clientY - metrics.hostRect.top;
      const x = (hostX - metrics.hostRect.width / 2 - cameraPan.x) / cameraZoom + metrics.worldCenterX;
      const y = (hostY - metrics.hostRect.height / 2 - cameraPan.y) / cameraZoom + metrics.worldCenterY;
      const pixelX = Math.floor(x * metrics.scaleX);
      const pixelY = Math.floor(y * metrics.scaleY);
      return { x, y, pixelX, pixelY };
    },
    [cameraPan.x, cameraPan.y, cameraZoom, getAuthoringMetrics]
  );

  const displayedTextObjects = useMemo(
    () => textDraftObjects ?? activeTextObjects,
    [activeTextObjects, textDraftObjects],
  );

  const getDisplayedBitmapTransformRect = useCallback((selection: {
    x: number;
    y: number;
    width: number;
    height: number;
    flipX?: boolean;
    flipY?: boolean;
  }) => ({
    x: selection.flipX ? selection.x - selection.width : selection.x,
    y: selection.flipY ? selection.y - selection.height : selection.y,
    width: selection.width,
    height: selection.height,
  }), []);

  const getDisplayedBitmapTransformBounds = useCallback((selection: {
    x: number;
    y: number;
    width: number;
    height: number;
    flipX?: boolean;
    flipY?: boolean;
    rotation: number;
  }) => getRotatedRectBounds(getDisplayedBitmapTransformRect(selection), selection.rotation), [getDisplayedBitmapTransformRect]);

  useEffect(() => {
    const debugWindow = window as Window & {
      __codexBitmapSelectionDebug?: {
        owner: BitmapSelectionOwner;
        activeKnifePieceId: string | null;
        items: Array<{
          id: string;
          displayRect: RectBounds;
          clientDisplayRect: RectBounds;
          clientHandleBounds: Record<ResizeHandle, RectBounds>;
        }>;
      } | null;
    };
    const metrics = getAuthoringMetrics();

    if (!activeBitmapSelectionSession?.items.length || !metrics) {
      debugWindow.__codexBitmapSelectionDebug = null;
      return;
    }

    const toClientRect = (rect: RectBounds): RectBounds => {
      const left =
        metrics.hostRect.left +
        (rect.x / metrics.scaleX - metrics.worldCenterX) * cameraZoom +
        metrics.hostRect.width / 2 +
        cameraPan.x;
      const top =
        metrics.hostRect.top +
        (rect.y / metrics.scaleY - metrics.worldCenterY) * cameraZoom +
        metrics.hostRect.height / 2 +
        cameraPan.y;
      const right =
        metrics.hostRect.left +
        ((rect.x + rect.width) / metrics.scaleX - metrics.worldCenterX) * cameraZoom +
        metrics.hostRect.width / 2 +
        cameraPan.x;
      const bottom =
        metrics.hostRect.top +
        ((rect.y + rect.height) / metrics.scaleY - metrics.worldCenterY) * cameraZoom +
        metrics.hostRect.height / 2 +
        cameraPan.y;

      return {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
      };
    };

    debugWindow.__codexBitmapSelectionDebug = {
      owner: activeBitmapSelectionSession.owner,
      activeKnifePieceId,
      items: activeBitmapSelectionSession.items.map((item) => {
        const displayRect = getDisplayedBitmapTransformBounds(item);
        const handleBounds = buildResizeHandleBounds(displayRect, LASSO_RESIZE_HANDLE_SIZE);
        return {
          id: item.id,
          displayRect,
          clientDisplayRect: toClientRect(displayRect),
          clientHandleBounds: Object.fromEntries(
            Object.entries(handleBounds).map(([handle, rect]) => [handle, toClientRect(rect)]),
          ) as Record<ResizeHandle, RectBounds>,
        };
      }),
    };

    return () => {
      debugWindow.__codexBitmapSelectionDebug = null;
    };
  }, [
    activeBitmapSelectionSession,
    activeKnifePieceId,
    cameraPan.x,
    cameraPan.y,
    cameraZoom,
    getAuthoringMetrics,
    getDisplayedBitmapTransformBounds,
  ]);

  const measureTextObjectBounds = useCallback((textObject: DrawingTextObject) => {
    const ctx = canvasRef.current?.getContext("2d") ?? lassoOverlayRef.current?.getContext("2d");
    if (!ctx) {
      return null;
    }

    return measureDrawingTextObjectBounds(ctx, textObject);
  }, []);

  const measureTextObjectDisplayRect = useCallback((textObject: DrawingTextObject) => {
    const ctx = canvasRef.current?.getContext("2d") ?? lassoOverlayRef.current?.getContext("2d");
    if (!ctx) {
      return null;
    }

    return measureDrawingTextDisplayRect(ctx, textObject);
  }, []);

  const measureTextObjectLayout = useCallback((textObject: DrawingTextObject) => {
    const ctx = canvasRef.current?.getContext("2d") ?? lassoOverlayRef.current?.getContext("2d");
    if (!ctx) {
      return null;
    }

    return measureDrawingTextLayout(ctx, textObject);
  }, []);

  const measureTextSelectionBounds = useCallback((
    textObjects: DrawingTextObject[],
    objectIds: string[],
  ): RectBounds | null => {
    const objectIdSet = new Set(objectIds);
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let hasAnyObject = false;

    for (const textObject of textObjects) {
      if (!objectIdSet.has(textObject.id)) {
        continue;
      }

      const bounds = measureTextObjectBounds(textObject);
      if (!bounds) {
        continue;
      }

      hasAnyObject = true;
      minX = Math.min(minX, bounds.x);
      minY = Math.min(minY, bounds.y);
      maxX = Math.max(maxX, bounds.x + bounds.width);
      maxY = Math.max(maxY, bounds.y + bounds.height);
    }

    if (!hasAnyObject || !Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      return null;
    }

    return {
      x: minX,
      y: minY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
    };
  }, [measureTextObjectBounds]);

  const getDisplayedBoxSelectionRect = useCallback((selection: ActiveBoxSelection | null): RectBounds | null => {
    if (!selection) {
      return null;
    }

    if (selection.kind === "text") {
      return measureTextSelectionBounds(displayedTextObjects, selection.objectIds);
    }

    return getDisplayedBitmapTransformBounds(selection);
  }, [displayedTextObjects, getDisplayedBitmapTransformBounds, measureTextSelectionBounds]);

  const getDisplayedLassoSelectionRect = useCallback((selection: ActiveLassoSelection | null): RectBounds | null => {
    if (!selection) {
      return null;
    }

    if (selection.kind === "text") {
      return measureTextSelectionBounds(displayedTextObjects, selection.objectIds);
    }

    return getDisplayedBitmapTransformBounds(selection);
  }, [displayedTextObjects, getDisplayedBitmapTransformBounds, measureTextSelectionBounds]);

  const buildTextInteractionInitialObjects = useCallback((
    textObjects: DrawingTextObject[],
    objectIds: string[],
  ) =>
    textObjects
      .filter((textObject) => objectIds.includes(textObject.id))
      .flatMap((textObject) => {
        const bounds = measureTextObjectBounds(textObject);
        const displayRect = measureTextObjectDisplayRect(textObject);
        if (!bounds || !displayRect) {
          return [];
        }

        return [{
          id: textObject.id,
          x: textObject.x,
          y: textObject.y,
          width: textObject.width,
          fontSize: textObject.fontSize,
          flipX: textObject.flipX,
          flipY: textObject.flipY,
          rotation: textObject.rotation,
          displayX: bounds.x,
          displayY: bounds.y,
          displayWidth: bounds.width,
          displayHeight: bounds.height,
          displayCenterX: displayRect.x + displayRect.width / 2,
          displayCenterY: displayRect.y + displayRect.height / 2,
        }];
      }),
  [measureTextObjectBounds, measureTextObjectDisplayRect]);

  const beginTextInteraction = useCallback((
    objectIds: string[],
    point: { x: number; y: number },
    mode: "moving" | "resizing" | "rotating",
    resizeHandle?: ResizeHandle | null,
  ) => {
    const uniqueIds = Array.from(new Set(objectIds));
    if (uniqueIds.length === 0) {
      return false;
    }

    const baseObjects = cloneDrawingTextObjects(displayedTextObjects);
    const initialObjects = buildTextInteractionInitialObjects(baseObjects, uniqueIds);
    if (initialObjects.length === 0) {
      return false;
    }

    setTextDraftObjects(baseObjects);
    textInteractionRef.current =
      mode === "moving"
        ? {
            mode,
            objectIds: uniqueIds,
            startPointerX: point.x,
            startPointerY: point.y,
            initialObjects,
          }
        : mode === "resizing"
          ? (() => {
            const startBounds = measureTextSelectionBounds(baseObjects, uniqueIds);
            if (!startBounds) {
              return null;
            }

            return {
              mode,
              objectIds: uniqueIds,
              handle: resizeHandle ?? "se",
              startPointerX: point.x,
              startPointerY: point.y,
              intentStartPointerX: point.x,
              intentStartPointerY: point.y,
              lastPointerX: point.x,
              lastPointerY: point.y,
              startBounds,
              initialObjects,
              intentFamily: null,
              intentLock: null,
            };
            })()
          : (() => {
              const startBounds = measureTextSelectionBounds(baseObjects, uniqueIds);
              if (!startBounds) {
                return null;
              }

              const rotationReference =
                initialObjects.length === 1 ? normalizeDrawingTextRotation(initialObjects[0].rotation) : 0;

              return {
                mode,
                objectIds: uniqueIds,
                startPointerX: point.x,
                startPointerY: point.y,
                startBounds,
                startAngle: Math.atan2(point.y - (startBounds.y + startBounds.height / 2), point.x - (startBounds.x + startBounds.width / 2)),
                initialObjects,
                rotationReference,
                snapTargetRotation: null,
              };
            })();

    if (!textInteractionRef.current) {
      setTextDraftObjects(null);
      return false;
    }

    setSelectedTextObjectId(uniqueIds.length === 1 ? uniqueIds[0] : null);
    setRightPanelTab("Properties");
    return true;
  }, [buildTextInteractionInitialObjects, displayedTextObjects, measureTextSelectionBounds]);

  const buildResizedTextDraftObjects = useCallback((
    baseDraftObjects: DrawingTextObject[],
    initialObjects: TextInteractionInitialObject[],
    startBounds: RectBounds,
    nextSelectionRect: ResolvedResizeRect,
    options?: { reconcileVerticalTextWidth?: boolean },
  ) => {
    const nextDraftObjects = cloneDrawingTextObjects(baseDraftObjects);
    const initialObjectMap = new Map(initialObjects.map((textObject) => [textObject.id, textObject]));
    const selectionFlipX = nextSelectionRect.flipX;
    const selectionFlipY = nextSelectionRect.flipY;
    const nextSelectionWidth = nextSelectionRect.width;
    const nextSelectionHeight = nextSelectionRect.height;
    const scaleX = nextSelectionWidth / Math.max(1, startBounds.width);
    const scaleY = nextSelectionHeight / Math.max(1, startBounds.height);

    for (let index = 0; index < nextDraftObjects.length; index += 1) {
      const initialObject = initialObjectMap.get(nextDraftObjects[index].id);
      if (!initialObject) {
        continue;
      }

      const relativeLeft = initialObject.displayX - startBounds.x;
      const relativeRight = relativeLeft + initialObject.displayWidth;
      const relativeTop = initialObject.displayY - startBounds.y;
      const relativeBottom = relativeTop + initialObject.displayHeight;
      const targetDisplayX = selectionFlipX
        ? nextSelectionRect.x + nextSelectionRect.width - relativeRight * scaleX
        : nextSelectionRect.x + relativeLeft * scaleX;
      const targetDisplayY = selectionFlipY
        ? nextSelectionRect.y + nextSelectionRect.height - relativeBottom * scaleY
        : nextSelectionRect.y + relativeTop * scaleY;
      const nextFlipX = selectionFlipX ? !initialObject.flipX : initialObject.flipX;
      const nextFlipY = selectionFlipY ? !initialObject.flipY : initialObject.flipY;
      const provisionalObject: DrawingTextObject = {
        ...nextDraftObjects[index],
        x: 0,
        y: 0,
        width: Math.max(48, initialObject.width * scaleX),
        fontSize: Math.max(10, initialObject.fontSize * scaleY),
        flipX: nextFlipX,
        flipY: nextFlipY,
      };
      if (options?.reconcileVerticalTextWidth) {
        const currentLayout = measureTextObjectLayout(provisionalObject);
        const staleWidthGap = currentLayout ? provisionalObject.width - currentLayout.renderedWidth : 0;
        if (currentLayout && staleWidthGap > 8) {
          const contentFitWidth = Math.max(48, Math.ceil(currentLayout.renderedWidth + 2));
          const contentFitObject = {
            ...provisionalObject,
            width: contentFitWidth,
          };
          const contentFitLayout = measureTextObjectLayout(contentFitObject);
          if (contentFitLayout && contentFitLayout.lines.length === currentLayout.lines.length) {
            provisionalObject.width = contentFitWidth;
          }
        }
      }
      const provisionalBounds = measureTextObjectBounds(provisionalObject);
      const nextDisplayWidth = provisionalBounds?.width ?? provisionalObject.width;
      const nextDisplayHeight = provisionalBounds?.height ?? Math.max(24, provisionalObject.fontSize);

      nextDraftObjects[index] = {
        ...provisionalObject,
        x: nextFlipX ? targetDisplayX + nextDisplayWidth : targetDisplayX,
        y: nextFlipY ? targetDisplayY + nextDisplayHeight : targetDisplayY,
      };
    }

    return nextDraftObjects;
  }, [measureTextObjectBounds, measureTextObjectLayout]);

  const findTopmostTextObjectAtPoint = useCallback((
    point: { x: number; y: number },
    textObjects: DrawingTextObject[],
  ) => {
    for (let index = textObjects.length - 1; index >= 0; index -= 1) {
      const textObject = textObjects[index];
      const bounds = measureTextObjectBounds(textObject);
      if (!bounds) {
        continue;
      }

      const resizeHandle = resolveResizeHandleAtPoint(bounds, point, LASSO_RESIZE_HANDLE_SIZE);
      const insideBounds =
        point.x >= bounds.x &&
        point.x <= bounds.x + bounds.width &&
        point.y >= bounds.y &&
        point.y <= bounds.y + bounds.height;

      if (resizeHandle || insideBounds) {
        return {
          textObject,
          bounds,
          resizeHandle,
        };
      }
    }

    return null;
  }, [measureTextObjectBounds, LASSO_RESIZE_HANDLE_SIZE]);

  const findTextObjectIdsInRect = useCallback((
    rect: RectBounds,
    textObjects: DrawingTextObject[],
  ) =>
    textObjects.flatMap((textObject) => {
      const bounds = measureTextObjectBounds(textObject);
      if (!bounds) {
        return [];
      }

      const intersects =
        bounds.x < rect.x + rect.width &&
        bounds.x + bounds.width > rect.x &&
        bounds.y < rect.y + rect.height &&
        bounds.y + bounds.height > rect.y;

      return intersects ? [textObject.id] : [];
    }),
  [measureTextObjectBounds]);

  const isPointInsideLassoPath = useCallback((point: { x: number; y: number }, path: LassoPoint[]) => {
    let isInside = false;
    for (let index = 0, previousIndex = path.length - 1; index < path.length; previousIndex = index, index += 1) {
      const currentPoint = path[index];
      const previousPoint = path[previousIndex];
      const intersects =
        currentPoint.y > point.y !== previousPoint.y > point.y &&
        point.x <
          ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
            ((previousPoint.y - currentPoint.y) || Number.EPSILON) +
            currentPoint.x;
      if (intersects) {
        isInside = !isInside;
      }
    }
    return isInside;
  }, []);

  const doesTextBoundsIntersectLassoPath = useCallback((
    bounds: RectBounds,
    path: LassoPoint[],
  ) => {
    if (path.length < 3) {
      return false;
    }

    const rectPoints = [
      { x: bounds.x, y: bounds.y },
      { x: bounds.x + bounds.width, y: bounds.y },
      { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
      { x: bounds.x, y: bounds.y + bounds.height },
    ];

    const isPointInsideRect = (point: { x: number; y: number }) =>
      point.x >= bounds.x &&
      point.x <= bounds.x + bounds.width &&
      point.y >= bounds.y &&
      point.y <= bounds.y + bounds.height;

    const ccw = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) =>
      (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);

    const segmentsIntersect = (
      startA: { x: number; y: number },
      endA: { x: number; y: number },
      startB: { x: number; y: number },
      endB: { x: number; y: number },
    ) =>
      ccw(startA, startB, endB) !== ccw(endA, startB, endB) &&
      ccw(startA, endA, startB) !== ccw(startA, endA, endB);

    if (rectPoints.some((point) => isPointInsideLassoPath(point, path))) {
      return true;
    }

    if (path.some((point) => isPointInsideRect(point))) {
      return true;
    }

    for (let pathIndex = 0, previousPathIndex = path.length - 1; pathIndex < path.length; previousPathIndex = pathIndex, pathIndex += 1) {
      const pathStart = path[previousPathIndex];
      const pathEnd = path[pathIndex];

      for (let rectIndex = 0; rectIndex < rectPoints.length; rectIndex += 1) {
        const rectStart = rectPoints[rectIndex];
        const rectEnd = rectPoints[(rectIndex + 1) % rectPoints.length];
        if (segmentsIntersect(pathStart, pathEnd, rectStart, rectEnd)) {
          return true;
        }
      }
    }

    return false;
  }, [isPointInsideLassoPath]);

  const findTextObjectIdsInLassoPath = useCallback((
    path: LassoPoint[],
    textObjects: DrawingTextObject[],
  ) =>
    textObjects.flatMap((textObject) => {
      const bounds = measureTextObjectBounds(textObject);
      if (!bounds) {
        return [];
      }

      return doesTextBoundsIntersectLassoPath(bounds, path) ? [textObject.id] : [];
    }),
  [doesTextBoundsIntersectLassoPath, measureTextObjectBounds]);

  const createTextSelectionCanvas = useCallback((objectIds: string[], textObjects: DrawingTextObject[]) => {
    const selectionBounds = measureTextSelectionBounds(textObjects, objectIds);
    if (!selectionBounds) {
      return null;
    }

    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = Math.max(1, Math.ceil(selectionBounds.width));
    sourceCanvas.height = Math.max(1, Math.ceil(selectionBounds.height));
    const sourceCtx = sourceCanvas.getContext("2d");
    if (!sourceCtx) {
      return null;
    }

    const objectIdSet = new Set(objectIds);
    for (const textObject of textObjects) {
      if (!objectIdSet.has(textObject.id)) {
        continue;
      }

      const bounds = measureTextObjectBounds(textObject);
      if (!bounds) {
        continue;
      }

      drawDrawingTextObject(sourceCtx, {
        ...textObject,
        x: textObject.flipX ? bounds.x - selectionBounds.x + bounds.width : bounds.x - selectionBounds.x,
        y: textObject.flipY ? bounds.y - selectionBounds.y + bounds.height : bounds.y - selectionBounds.y,
      });
    }

    return {
      canvas: sourceCanvas,
      bounds: selectionBounds,
    };
  }, [measureTextObjectBounds, measureTextSelectionBounds]);

  const setSelectTextSelection = useCallback((objectIds: string[]) => {
    const uniqueIds = Array.from(new Set(objectIds));
    boxSelectionSourceCanvasRef.current = null;
    setSelectionBoxDraft(null);
    setActiveBoxSelectionState(uniqueIds.length > 0 ? { kind: "text", objectIds: uniqueIds } : null);
    setSelectedTextObjectId(uniqueIds.length === 1 ? uniqueIds[0] : null);
    setRightPanelTab("Properties");
  }, [setActiveBoxSelectionState, setRightPanelTab]);

  const setLassoTextSelection = useCallback((objectIds: string[]) => {
    const uniqueIds = Array.from(new Set(objectIds));
    selectionSourceCanvasRef.current = null;
    setActiveLassoSelectionState(
      uniqueIds.length > 0
        ? {
            kind: "text",
            objectIds: uniqueIds,
            flipX: false,
            flipY: false,
          }
        : null,
    );
    setSelectedTextObjectId(uniqueIds.length === 1 ? uniqueIds[0] : null);
  }, [setActiveLassoSelectionState]);

  useEffect(() => {
    if (!pendingTextSelection) {
      return;
    }

    const nextObjectIds = Array.from(new Set(pendingTextSelection.objectIds));
    if (nextObjectIds.length === 0) {
      setPendingTextSelection(null);
      return;
    }

    const allObjectsPresent = nextObjectIds.every((objectId) =>
      activeTextObjects.some((textObject) => textObject.id === objectId),
    );
    if (!allObjectsPresent) {
      return;
    }

    if (pendingTextSelection.mode === "select") {
      setSelectTextSelection(nextObjectIds);
    } else if (pendingTextSelection.mode === "lasso") {
      setLassoTextSelection(nextObjectIds);
    } else {
      setSelectedTextObjectId(nextObjectIds.length === 1 ? nextObjectIds[0] : null);
      setRightPanelTab("Properties");
    }

    setPendingTextSelection(null);
  }, [activeTextObjects, pendingTextSelection, setLassoTextSelection, setSelectTextSelection]);

  const commitTextObjects = useCallback((nextTextObjects: DrawingTextObject[]) => {
    if (!onTextObjectsChange) {
      return false;
    }

    const didCommit = onTextObjectsChange(cloneDrawingTextObjects(nextTextObjects));
    if (didCommit !== false) {
      setTextDraftObjects(null);
    }
    return didCommit !== false;
  }, [onTextObjectsChange]);

  const duplicateSelectedTextObjects = useCallback((
    objectIds: string[],
    selectionSource: "select" | "lasso",
  ) => {
    const objectIdSet = new Set(objectIds);
    const selectedObjects = activeTextObjects.filter((textObject) => objectIdSet.has(textObject.id));
    if (selectedObjects.length === 0) {
      return false;
    }

    const duplicatedObjects = selectedObjects.map((textObject) => ({
      ...textObject,
      id: globalThis.crypto?.randomUUID?.() ?? `text-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      x: textObject.x + 16,
      y: textObject.y + 16,
    }));
    const nextObjects = [...activeTextObjects, ...duplicatedObjects];
    const didCommit = commitTextObjects(nextObjects);
    if (!didCommit) {
      return false;
    }

    setPendingTextSelection({
      mode: selectionSource,
      objectIds: duplicatedObjects.map((textObject) => textObject.id),
    });
    return true;
  }, [activeTextObjects, commitTextObjects]);

  const deleteSelectedTextObjects = useCallback((objectIds: string[]) => {
    const objectIdSet = new Set(objectIds);
    const nextObjects = activeTextObjects.filter((textObject) => !objectIdSet.has(textObject.id));
    if (nextObjects.length === activeTextObjects.length) {
      return false;
    }

    const didCommit = commitTextObjects(nextObjects);
    if (!didCommit) {
      return false;
    }

    setPendingTextSelection(null);
    setSelectedTextObjectId(null);
    return true;
  }, [activeTextObjects, commitTextObjects]);

  const createDisplayedCanvasCopy = useCallback((
    sourceCanvas: DrawableImageSource,
    flipX: boolean,
    flipY: boolean,
  ) => {
    if (!flipX && !flipY) {
      if (sourceCanvas instanceof HTMLCanvasElement) {
        const copyCanvas = document.createElement("canvas");
        copyCanvas.width = Math.max(1, sourceCanvas.width || 1);
        copyCanvas.height = Math.max(1, sourceCanvas.height || 1);
        const copyCtx = copyCanvas.getContext("2d");
        if (!copyCtx) {
          return null;
        }
        copyCtx.drawImage(sourceCanvas, 0, 0);
        return copyCanvas;
      }

      const copyCanvas = document.createElement("canvas");
      copyCanvas.width = Math.max(1, sourceCanvas.naturalWidth || sourceCanvas.width || 1);
      copyCanvas.height = Math.max(1, sourceCanvas.naturalHeight || sourceCanvas.height || 1);
      const copyCtx = copyCanvas.getContext("2d");
      if (!copyCtx) {
        return null;
      }
      copyCtx.drawImage(sourceCanvas, 0, 0, copyCanvas.width, copyCanvas.height);
      return copyCanvas;
    }

    const sourceWidth =
      sourceCanvas instanceof HTMLImageElement
        ? Math.max(1, sourceCanvas.naturalWidth || sourceCanvas.width || 1)
        : Math.max(1, sourceCanvas.width || 1);
    const sourceHeight =
      sourceCanvas instanceof HTMLImageElement
        ? Math.max(1, sourceCanvas.naturalHeight || sourceCanvas.height || 1)
        : Math.max(1, sourceCanvas.height || 1);

    const displayedCanvas = document.createElement("canvas");
    displayedCanvas.width = sourceWidth;
    displayedCanvas.height = sourceHeight;
    const displayedCtx = displayedCanvas.getContext("2d");
    if (!displayedCtx) {
      return null;
    }

    displayedCtx.save();
    displayedCtx.translate(flipX ? displayedCanvas.width : 0, flipY ? displayedCanvas.height : 0);
    displayedCtx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    displayedCtx.drawImage(sourceCanvas, 0, 0);
    displayedCtx.restore();
    return displayedCanvas;
  }, []);

  const createRotatedDisplayedCanvasCopyByDegrees = useCallback((
    sourceCanvas: DrawableImageSource,
    flipX: boolean,
    flipY: boolean,
    rotationDegrees: number,
  ) => {
    const displayedCanvas = createDisplayedCanvasCopy(sourceCanvas, flipX, flipY);
    if (!displayedCanvas) {
      return null;
    }

    const normalizedRotation = normalizeContinuousRotation(rotationDegrees);
    if (Math.abs(normalizedRotation) < 0.001) {
      return displayedCanvas;
    }

    const radians = (normalizedRotation * Math.PI) / 180;
    const sourceWidth = Math.max(1, displayedCanvas.width || 1);
    const sourceHeight = Math.max(1, displayedCanvas.height || 1);
    const rotatedWidth = Math.max(1, Math.ceil(Math.abs(sourceWidth * Math.cos(radians)) + Math.abs(sourceHeight * Math.sin(radians))));
    const rotatedHeight = Math.max(1, Math.ceil(Math.abs(sourceWidth * Math.sin(radians)) + Math.abs(sourceHeight * Math.cos(radians))));

    const rotatedCanvas = document.createElement("canvas");
    rotatedCanvas.width = rotatedWidth;
    rotatedCanvas.height = rotatedHeight;
    const rotatedCtx = rotatedCanvas.getContext("2d");
    if (!rotatedCtx) {
      return null;
    }

    rotatedCtx.save();
    rotatedCtx.translate(rotatedWidth / 2, rotatedHeight / 2);
    rotatedCtx.rotate(radians);
    rotatedCtx.drawImage(displayedCanvas, -sourceWidth / 2, -sourceHeight / 2, sourceWidth, sourceHeight);
    rotatedCtx.restore();
    return rotatedCanvas;
  }, [createDisplayedCanvasCopy]);

  const createTransformedBitmapSelectionCanvas = useCallback((
    sourceCanvas: DrawableImageSource,
    selection: ActiveBitmapTransformSelection,
  ) => {
    const normalizedRotation = normalizeContinuousRotation(selection.rotation);
    const hasTransform = selection.flipX || selection.flipY || Math.abs(normalizedRotation) > 0.001;
    if (!hasTransform) {
      return sourceCanvas instanceof HTMLCanvasElement ? sourceCanvas : createDisplayedCanvasCopy(sourceCanvas, false, false);
    }

    return createRotatedDisplayedCanvasCopyByDegrees(
      sourceCanvas,
      selection.flipX,
      selection.flipY,
      normalizedRotation,
    );
  }, [createDisplayedCanvasCopy, createRotatedDisplayedCanvasCopyByDegrees]);

  const resolveBitmapSelectionWithPreservedCenter = useCallback((
    selection: ActiveBitmapTransformSelection,
    nextState: {
      flipX?: boolean;
      flipY?: boolean;
      rotation?: number;
      x?: number;
      y?: number;
      width?: number;
      height?: number;
    },
  ): ActiveBitmapTransformSelection => {
    const previousDisplayRect = getDisplayedBitmapTransformRect(selection);
    const nextWidth = nextState.width ?? selection.width;
    const nextHeight = nextState.height ?? selection.height;
    const nextFlipX = nextState.flipX ?? selection.flipX;
    const nextFlipY = nextState.flipY ?? selection.flipY;
    const nextDisplayCenterX = previousDisplayRect.x + previousDisplayRect.width / 2;
    const nextDisplayCenterY = previousDisplayRect.y + previousDisplayRect.height / 2;
    const nextDisplayX =
      nextState.x ?? (nextDisplayCenterX - nextWidth / 2);
    const nextDisplayY =
      nextState.y ?? (nextDisplayCenterY - nextHeight / 2);

    return {
      ...selection,
      x: nextFlipX ? nextDisplayX + nextWidth : nextDisplayX,
      y: nextFlipY ? nextDisplayY + nextHeight : nextDisplayY,
      width: nextWidth,
      height: nextHeight,
      flipX: nextFlipX,
      flipY: nextFlipY,
      rotation: nextState.rotation ?? selection.rotation,
    };
  }, [getDisplayedBitmapTransformRect]);

  const flipSelectedTextObjects = useCallback((
    objectIds: string[],
    axis: "x" | "y",
  ) => {
    const uniqueIds = Array.from(new Set(objectIds));
    if (uniqueIds.length === 0) {
      return false;
    }

    const selectionBounds = measureTextSelectionBounds(activeTextObjects, uniqueIds);
    if (!selectionBounds) {
      return false;
    }

    const objectIdSet = new Set(uniqueIds);
    const nextObjects = cloneDrawingTextObjects(activeTextObjects);
    let didUpdate = false;

    for (let index = 0; index < nextObjects.length; index += 1) {
      const textObject = nextObjects[index];
      if (!objectIdSet.has(textObject.id)) {
        continue;
      }

      const bounds = measureTextObjectBounds(textObject);
      if (!bounds) {
        continue;
      }

      const nextTextObject: DrawingTextObject = {
        ...textObject,
        flipX: axis === "x" ? !textObject.flipX : textObject.flipX,
        flipY: axis === "y" ? !textObject.flipY : textObject.flipY,
      };
      const nextBounds = measureTextObjectBounds(nextTextObject);
      if (!nextBounds) {
        continue;
      }

      const relativeLeft = bounds.x - selectionBounds.x;
      const relativeTop = bounds.y - selectionBounds.y;
      const targetDisplayX =
        axis === "x"
          ? selectionBounds.x + selectionBounds.width - relativeLeft - bounds.width
          : bounds.x;
      const targetDisplayY =
        axis === "y"
          ? selectionBounds.y + selectionBounds.height - relativeTop - bounds.height
          : bounds.y;

      nextObjects[index] = {
        ...nextTextObject,
        x: nextTextObject.flipX ? targetDisplayX + nextBounds.width : targetDisplayX,
        y: nextTextObject.flipY ? targetDisplayY + nextBounds.height : targetDisplayY,
      };
      didUpdate = true;
    }

    if (!didUpdate) {
      return false;
    }

    return commitTextObjects(nextObjects);
  }, [activeTextObjects, commitTextObjects, measureTextObjectBounds, measureTextSelectionBounds]);

  const flipBoxSelection = useCallback((axis: "x" | "y") => {
    const selection = activeBoxSelectionRef.current;
    if (!selection) {
      return false;
    }

    if (selection.kind === "text") {
      return flipSelectedTextObjects(selection.objectIds, axis);
    }

    restoreBitmapSelectionBackdropToCanvasRef.current();
    updateActiveBoxSelectionState((current) =>
      current?.kind === "bitmap"
        ? {
            kind: "bitmap",
            ...resolveBitmapSelectionWithPreservedCenter(current, {
              flipX: axis === "x" ? !current.flipX : current.flipX,
              flipY: axis === "y" ? !current.flipY : current.flipY,
            }),
          }
        : current,
    );
    return true;
  }, [flipSelectedTextObjects, resolveBitmapSelectionWithPreservedCenter, updateActiveBoxSelectionState]);

  const flipLassoSelection = useCallback((axis: "x" | "y") => {
    const selection = activeLassoSelectionRef.current;
    if (!selection) {
      return false;
    }

    if (selection.kind === "text") {
      return flipSelectedTextObjects(selection.objectIds, axis);
    }

    restoreBitmapSelectionBackdropToCanvasRef.current();
    updateActiveLassoSelectionState((current) =>
      current?.kind === "bitmap"
        ? {
            kind: "bitmap",
            ...resolveBitmapSelectionWithPreservedCenter(current, {
              flipX: axis === "x" ? !current.flipX : current.flipX,
              flipY: axis === "y" ? !current.flipY : current.flipY,
            }),
          }
        : current,
    );
    return true;
  }, [flipSelectedTextObjects, resolveBitmapSelectionWithPreservedCenter, updateActiveLassoSelectionState]);

  const commitSelectedTextObjectRotation = useCallback((rotation: number) => {
    const selectedId = selectedTextObjectIdRef.current;
    if (!selectedId) {
      return false;
    }

    const baseObjects = textDraftObjectsRef.current ?? activeTextObjects;
    const targetIndex = baseObjects.findIndex((textObject) => textObject.id === selectedId);
    if (targetIndex < 0) {
      return false;
    }

    const nextObjects = cloneDrawingTextObjects(baseObjects);
    const previousObject = baseObjects[targetIndex];
    const previousDisplayRect = measureTextObjectDisplayRect(previousObject);
    if (!previousDisplayRect) {
      return false;
    }

    const normalizedRotation = normalizeDrawingTextRotation(rotation);
    const nextObject: DrawingTextObject = {
      ...nextObjects[targetIndex],
      rotation: normalizedRotation,
    };
    const nextDisplayRect = measureTextObjectDisplayRect(nextObject);
    if (!nextDisplayRect) {
      return false;
    }

    const displayCenterX = previousDisplayRect.x + previousDisplayRect.width / 2;
    const displayCenterY = previousDisplayRect.y + previousDisplayRect.height / 2;
    const nextDisplayX = displayCenterX - nextDisplayRect.width / 2;
    const nextDisplayY = displayCenterY - nextDisplayRect.height / 2;

    nextObjects[targetIndex] = {
      ...nextObject,
      x: nextObject.flipX ? nextDisplayX + nextDisplayRect.width : nextDisplayX,
      y: nextObject.flipY ? nextDisplayY + nextDisplayRect.height : nextDisplayY,
    };

    return commitTextObjects(nextObjects);
  }, [activeTextObjects, commitTextObjects, measureTextObjectDisplayRect]);

  const commitSelectedTextObjectUpdate = useCallback((
    updater: (textObject: DrawingTextObject) => DrawingTextObject,
  ) => {
    const selectedId = selectedTextObjectIdRef.current;
    if (!selectedId) {
      return false;
    }

    const baseObjects = textDraftObjectsRef.current ?? activeTextObjects;
    const targetIndex = baseObjects.findIndex((textObject) => textObject.id === selectedId);
    if (targetIndex < 0) {
      return false;
    }

    const nextObjects = cloneDrawingTextObjects(baseObjects);
    const previousObject = baseObjects[targetIndex];
    const updatedObject = updater(nextObjects[targetIndex]);
    const previousBounds = measureTextObjectBounds(previousObject);
    const updatedBounds = measureTextObjectBounds(updatedObject);
    nextObjects[targetIndex] =
      previousBounds && updatedBounds
        ? {
            ...updatedObject,
            x: updatedObject.x + (previousBounds.x - updatedBounds.x),
            y: updatedObject.y + (previousBounds.y - updatedBounds.y),
          }
        : updatedObject;
    return commitTextObjects(nextObjects);
  }, [activeTextObjects, commitTextObjects, measureTextObjectBounds]);

  const createTextObjectAtPoint = useCallback((point: { x: number; y: number }) => {
    if (!canEditTextInCurrentFrame || !onTextObjectsChange) {
      return false;
    }

    const nextTextObject: DrawingTextObject = {
      id: globalThis.crypto?.randomUUID?.() ?? `text-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      text: "Text",
      x: point.x,
      y: point.y,
      width: DEFAULT_DRAWING_TEXT_WIDTH,
      flipX: false,
      flipY: false,
      rotation: 0,
      fontFamily: DEFAULT_DRAWING_TEXT_FONT,
      fontSize: DEFAULT_DRAWING_TEXT_SIZE,
      color: DEFAULT_DRAWING_TEXT_COLOR,
      bold: false,
      italic: false,
    };
    const nextObjects = [...activeTextObjects, nextTextObject];
    const didCommit = commitTextObjects(nextObjects);
    if (didCommit) {
      setPendingTextSelection({
        mode: "text",
        objectIds: [nextTextObject.id],
      });
    }
    return didCommit;
  }, [activeTextObjects, canEditTextInCurrentFrame, commitTextObjects, onTextObjectsChange]);

  const selectedTextObject = useMemo(
    () => displayedTextObjects.find((textObject) => textObject.id === selectedTextObjectId) ?? null,
    [displayedTextObjects, selectedTextObjectId],
  );

  const beginPlacedImageFromPreview = useCallback(
    (
      id: string,
      previewUrl: string,
      point: { x: number; y: number },
      preferredSize?: { width: number; height: number }
    ) => {
      const image = new Image();
      image.onload = () => {
        const drawWidth = preferredSize ? Math.max(24, preferredSize.width) : Math.max(24, Math.round((image.naturalWidth || 1) * Math.min(1, 220 / Math.max(image.naturalWidth || 1, image.naturalHeight || 1))));
        const drawHeight = preferredSize ? Math.max(24, preferredSize.height) : Math.max(24, Math.round((image.naturalHeight || 1) * Math.min(1, 220 / Math.max(image.naturalWidth || 1, image.naturalHeight || 1))));
        activePlacedImageSourceRef.current = image;
        setActivePlacedImageAsset({
          id,
          previewUrl,
          x: point.x - drawWidth / 2,
          y: point.y - drawHeight / 2,
          width: drawWidth,
          height: drawHeight,
          flipX: false,
          flipY: false,
          rotation: 0,
          naturalWidth: image.naturalWidth || drawWidth,
          naturalHeight: image.naturalHeight || drawHeight,
        });
        setRightPanelTab("Properties");
      };
      image.src = previewUrl;
    },
    []
  );

  const handleAssetDragStart = (e: React.DragEvent<HTMLDivElement>, asset: ImportedAsset) => {
    if (asset.kind !== "image" || !asset.previewUrl) {
      e.preventDefault();
      return;
    }

    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("application/x-diamond-asset-id", asset.id);
    e.dataTransfer.setData("text/plain", asset.name);
  };

  const handleLibrarySymbolDragStart = (e: React.DragEvent<HTMLDivElement>, symbol: LibrarySymbol) => {
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("application/x-diamond-symbol-id", symbol.id);
    e.dataTransfer.setData("text/plain", symbol.name);
  };

  const handleCanvasDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    const dragTypes = Array.from(e.dataTransfer.types);
    if (
      !dragTypes.includes("application/x-diamond-asset-id") &&
      !dragTypes.includes("application/x-diamond-symbol-id")
    ) {
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleCanvasDrop = (e: React.DragEvent<HTMLDivElement>) => {
    const host = canvasHostRef.current;
    const assetId = e.dataTransfer.getData("application/x-diamond-asset-id");
    const symbolId = e.dataTransfer.getData("application/x-diamond-symbol-id");
    if (!host || (!assetId && !symbolId)) return;

    const point = getCanvasPointFromClient(e.clientX, e.clientY);
    if (!point) return;

    e.preventDefault();

    if (assetId) {
      const asset = importedAssetsRef.current.find((item) => item.id === assetId);
      if (!asset || asset.kind !== "image" || !asset.previewUrl) return;
      beginPlacedImageFromPreview(asset.id, asset.previewUrl, point);
      return;
    }

    const symbol = librarySymbolsRef.current.find((item) => item.id === symbolId);
    if (!symbol) return;
    beginPlacedImageFromPreview(symbol.id, symbol.previewUrl, point, {
      width: symbol.width,
      height: symbol.height,
    });
  };

  const createCanvasSignature = useCallback((sourceCanvas: HTMLCanvasElement) => {
    const sourceCtx = sourceCanvas.getContext("2d");
    if (!sourceCtx) return `${sourceCanvas.width}x${sourceCanvas.height}-empty`;
    const { data } = sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
    let hash = 2166136261;
    for (let i = 0; i < data.length; i += 1) {
      hash ^= data[i];
      hash = Math.imul(hash, 16777619);
    }
    return `${sourceCanvas.width}x${sourceCanvas.height}-${(hash >>> 0).toString(16)}`;
  }, []);

  const parseHexColor = (value: string) => {
    const normalized = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000";
    return {
      r: Number.parseInt(normalized.slice(1, 3), 16),
      g: Number.parseInt(normalized.slice(3, 5), 16),
      b: Number.parseInt(normalized.slice(5, 7), 16),
      a: 255,
    };
  };

  const hexToRGBA = (hex: string, alpha: number) => {
    const normalized = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#000000";
    const r = Number.parseInt(normalized.slice(1, 3), 16);
    const g = Number.parseInt(normalized.slice(3, 5), 16);
    const b = Number.parseInt(normalized.slice(5, 7), 16);
    const clampedAlpha = Math.max(0, Math.min(1, alpha));
    return `rgba(${r},${g},${b},${clampedAlpha})`;
  };

  const mergeBrushPreviewDirtyRects = useCallback(
    (
      left: { left: number; top: number; width: number; height: number } | null,
      right: { left: number; top: number; width: number; height: number } | null,
      canvasWidth: number,
      canvasHeight: number,
    ) => {
      if (!left) return right;
      if (!right) return left;

      const mergedLeft = Math.max(0, Math.min(left.left, right.left));
      const mergedTop = Math.max(0, Math.min(left.top, right.top));
      const mergedRight = Math.min(
        canvasWidth,
        Math.max(left.left + left.width, right.left + right.width),
      );
      const mergedBottom = Math.min(
        canvasHeight,
        Math.max(left.top + left.height, right.top + right.height),
      );

      return {
        left: mergedLeft,
        top: mergedTop,
        width: Math.max(1, mergedRight - mergedLeft),
        height: Math.max(1, mergedBottom - mergedTop),
      };
    },
    [],
  );

  const resolveBrushPreviewDirtyRect = useCallback(
    (
      points: CanvasPoint[],
      canvasWidth: number,
      canvasHeight: number,
      drawSingleDot: boolean,
      startIndex = 0,
    ) => {
      if (points.length === 0 || startIndex >= points.length) {
        return null;
      }

      const strokeSize = brushStrokeSizeRef.current;
      const variant = brushStrokeVariantRef.current;
      const glowGradientBrightnessValue = brushStrokeGradientBrightnessRef.current;
      const glowGradientRadiusValue = brushStrokeGradientRadiusRef.current;
      const smoothingValue = brushStrokeSmoothingRef.current;
      const metrics = getAuthoringMetrics();
      const scaleX = metrics?.scaleX ?? 1;
      const scaleY = metrics?.scaleY ?? 1;
      const firstPixelX = points[startIndex].pixelX ?? Math.floor(points[startIndex].x * scaleX);
      const firstPixelY = points[startIndex].pixelY ?? Math.floor(points[startIndex].y * scaleY);
      let minPixelX = firstPixelX;
      let maxPixelX = firstPixelX;
      let minPixelY = firstPixelY;
      let maxPixelY = firstPixelY;

      for (let index = startIndex + 1; index < points.length; index += 1) {
        const point = points[index];
        const pixelX = point.pixelX ?? Math.floor(point.x * scaleX);
        const pixelY = point.pixelY ?? Math.floor(point.y * scaleY);
        minPixelX = Math.min(minPixelX, pixelX);
        maxPixelX = Math.max(maxPixelX, pixelX);
        minPixelY = Math.min(minPixelY, pixelY);
        maxPixelY = Math.max(maxPixelY, pixelY);
      }

      let padding = Math.max(6, strokeSize * 1.4 + Math.max(2, (smoothingValue / 100) * strokeSize * 1.8));
      if (variant === "Glow" && glowGradientBrightnessValue > 0) {
        const gradientRadius = Math.max(0, Math.min(1, glowGradientRadiusValue / 100));
        padding = Math.max(padding, strokeSize * (2.1 + gradientRadius * 8.5));
      } else if (variant === "Sketch") {
        padding = Math.max(padding, strokeSize * 2.6);
      } else if (variant === "Pencil") {
        padding = Math.max(padding, strokeSize * 1.9);
      } else if (variant === "Pixelate") {
        padding = Math.max(padding, strokeSize * 2.2);
      } else if (variant === "Glow") {
        padding = Math.max(padding, strokeSize * 2.1);
      }

      if (drawSingleDot) {
        padding = Math.max(padding, strokeSize * 2.2);
      }

      const paddingX = Math.max(1, Math.ceil(padding * scaleX));
      const paddingY = Math.max(1, Math.ceil(padding * scaleY));
      const left = Math.max(0, Math.floor(minPixelX - paddingX));
      const top = Math.max(0, Math.floor(minPixelY - paddingY));
      const right = Math.min(canvasWidth, Math.ceil(maxPixelX + paddingX));
      const bottom = Math.min(canvasHeight, Math.ceil(maxPixelY + paddingY));

      return {
        left,
        top,
        width: Math.max(1, right - left),
        height: Math.max(1, bottom - top),
      };
    },
    [getAuthoringMetrics],
  );

  const resolveSimpleStrokeDirtyRect = useCallback(
    (
      points: CanvasPoint[],
      canvasWidth: number,
      canvasHeight: number,
      strokeSize: number,
      drawSingleDot: boolean,
    ) => {
      if (points.length === 0) {
        return null;
      }

      const metrics = getAuthoringMetrics();
      const scaleX = metrics?.scaleX ?? 1;
      const scaleY = metrics?.scaleY ?? 1;
      const firstPixelX = points[0].pixelX ?? Math.floor(points[0].x * scaleX);
      const firstPixelY = points[0].pixelY ?? Math.floor(points[0].y * scaleY);
      let minPixelX = firstPixelX;
      let maxPixelX = firstPixelX;
      let minPixelY = firstPixelY;
      let maxPixelY = firstPixelY;

      for (let index = 1; index < points.length; index += 1) {
        const point = points[index];
        const pixelX = point.pixelX ?? Math.floor(point.x * scaleX);
        const pixelY = point.pixelY ?? Math.floor(point.y * scaleY);
        minPixelX = Math.min(minPixelX, pixelX);
        maxPixelX = Math.max(maxPixelX, pixelX);
        minPixelY = Math.min(minPixelY, pixelY);
        maxPixelY = Math.max(maxPixelY, pixelY);
      }

      const basePadding = Math.max(6, strokeSize * (drawSingleDot ? 1.8 : 2.25));
      const paddingX = Math.max(1, Math.ceil(basePadding * scaleX));
      const paddingY = Math.max(1, Math.ceil(basePadding * scaleY));
      const left = Math.max(0, Math.floor(minPixelX - paddingX));
      const top = Math.max(0, Math.floor(minPixelY - paddingY));
      const right = Math.min(canvasWidth, Math.ceil(maxPixelX + paddingX));
      const bottom = Math.min(canvasHeight, Math.ceil(maxPixelY + paddingY));

      return {
        left,
        top,
        width: Math.max(1, right - left),
        height: Math.max(1, bottom - top),
      };
    },
    [getAuthoringMetrics],
  );

  const resolveBufferedBrushEffectiveSmoothing = useCallback(
    (variant: BrushToolVariant, smoothingValue: number) => {
      if (variant === "Pencil") {
        return Math.min(100, Math.max(smoothingValue, 10));
      }
      if (variant === "Sketch") {
        return Math.round(smoothingValue * 0.8);
      }
      if (variant === "Pixelate") {
        return Math.round(smoothingValue * 0.35);
      }
      return smoothingValue;
    },
    [],
  );

  const smoothBufferedBrushPoint = useCallback((input: CanvasPoint[], index: number, radius: number, blend: number) => {
    const point = input[index];
    if (!point || index === 0 || index === input.length - 1) {
      return point;
    }

    let sumX = 0;
    let sumY = 0;
    let count = 0;
    for (let i = index - radius; i <= index + radius; i += 1) {
      if (i < 0 || i >= input.length) continue;
      sumX += input[i].x;
      sumY += input[i].y;
      count += 1;
    }

    const avgX = sumX / Math.max(1, count);
    const avgY = sumY / Math.max(1, count);
    return {
      x: point.x * (1 - blend) + avgX * blend,
      y: point.y * (1 - blend) + avgY * blend,
    };
  }, []);

  const resolveBufferedBrushRenderState = useCallback(
    (points: CanvasPoint[]) => {
      const variant = brushStrokeVariantRef.current;
      const smoothingValue = brushStrokeSmoothingRef.current;
      const effectiveSmoothing = resolveBufferedBrushEffectiveSmoothing(variant, smoothingValue);
      const previousPointCount = Math.min(brushStrokeProcessedPointCountRef.current, points.length);
      const renderPoints = brushStrokeRenderPointsRef.current;

      if (points.length === 0) {
        renderPoints.length = 0;
        brushStrokeSmoothedPointsRef.current.length = 0;
        brushStrokeProcessedPointCountRef.current = 0;
        return {
          renderPoints,
          effectiveSmoothing,
          segmentStartIndex: 0,
        };
      }

      const usesSmoothing = effectiveSmoothing > 0 && points.length > 2;
      if (!usesSmoothing) {
        const canReuseRenderPoints = renderPoints.length === previousPointCount;
        const changedStart = canReuseRenderPoints ? Math.max(0, previousPointCount - 1) : 0;
        renderPoints.length = points.length;
        for (let index = changedStart; index < points.length; index += 1) {
          renderPoints[index] = points[index];
        }
        brushStrokeSmoothedPointsRef.current.length = 0;
        brushStrokeProcessedPointCountRef.current = points.length;
        return {
          renderPoints,
          effectiveSmoothing,
          segmentStartIndex: Math.max(1, previousPointCount > 0 ? changedStart : 1),
        };
      }

      const radius = Math.max(1, Math.round((effectiveSmoothing / 100) * 4));
      const blend = Math.min(0.9, (effectiveSmoothing / 100) * 0.85);
      const smoothedPoints = brushStrokeSmoothedPointsRef.current;
      const canReuseSmoothedPoints = smoothedPoints.length === previousPointCount;
      const changedStartPassOne = canReuseSmoothedPoints ? Math.max(0, previousPointCount - radius) : 0;

      smoothedPoints.length = points.length;
      for (let index = changedStartPassOne; index < points.length; index += 1) {
        smoothedPoints[index] = smoothBufferedBrushPoint(points, index, radius, blend);
      }

      const shouldUseSecondPass = effectiveSmoothing >= 65 && points.length > 3;
      const canReuseRenderPoints = renderPoints.length === previousPointCount;
      const changedStartRender = shouldUseSecondPass
        ? canReuseRenderPoints
          ? Math.max(0, changedStartPassOne - radius)
          : 0
        : canReuseRenderPoints
          ? changedStartPassOne
          : 0;

      renderPoints.length = points.length;
      if (shouldUseSecondPass) {
        for (let index = changedStartRender; index < points.length; index += 1) {
          renderPoints[index] = smoothBufferedBrushPoint(smoothedPoints, index, radius, blend);
        }
      } else {
        for (let index = changedStartRender; index < points.length; index += 1) {
          renderPoints[index] = smoothedPoints[index];
        }
      }

      brushStrokeProcessedPointCountRef.current = points.length;
      return {
        renderPoints,
        effectiveSmoothing,
        segmentStartIndex: Math.max(1, previousPointCount > 0 ? changedStartRender : 1),
      };
    },
    [resolveBufferedBrushEffectiveSmoothing, smoothBufferedBrushPoint],
  );

  const restoreBrushStrokeRegion = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      dirtyRect: { left: number; top: number; width: number; height: number } | null,
    ) => {
      const snapshotCanvas = brushStrokeBaseCanvasRef.current;
      const snapshotRect = brushStrokeBaseRectRef.current;
      if (!snapshotCanvas || !snapshotRect) {
        return false;
      }

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (!dirtyRect) {
        ctx.clearRect(snapshotRect.left, snapshotRect.top, snapshotRect.width, snapshotRect.height);
        ctx.drawImage(
          snapshotCanvas,
          0,
          0,
          snapshotRect.width,
          snapshotRect.height,
          snapshotRect.left,
          snapshotRect.top,
          snapshotRect.width,
          snapshotRect.height,
        );
      } else {
        const left = Math.max(snapshotRect.left, dirtyRect.left);
        const top = Math.max(snapshotRect.top, dirtyRect.top);
        const right = Math.min(snapshotRect.left + snapshotRect.width, dirtyRect.left + dirtyRect.width);
        const bottom = Math.min(snapshotRect.top + snapshotRect.height, dirtyRect.top + dirtyRect.height);
        if (right <= left || bottom <= top) {
          ctx.restore();
          return true;
        }
        const width = right - left;
        const height = bottom - top;
        ctx.clearRect(left, top, width, height);
        ctx.drawImage(
          snapshotCanvas,
          left - snapshotRect.left,
          top - snapshotRect.top,
          width,
          height,
          left,
          top,
          width,
          height,
        );
      }
      ctx.restore();
      return true;
    },
    [],
  );

  const ensureBrushStrokeBaseRegion = useCallback(
    (
      sourceCanvas: HTMLCanvasElement,
      dirtyRect: { left: number; top: number; width: number; height: number } | null,
    ) => {
      if (!dirtyRect) {
        return false;
      }

      const existingRect = brushStrokeBaseRectRef.current;
      const existingCanvas = brushStrokeBaseCanvasRef.current;
      const nextRect = mergeBrushPreviewDirtyRects(existingRect, dirtyRect, sourceCanvas.width, sourceCanvas.height);
      if (!nextRect) {
        return false;
      }

      if (
        existingCanvas &&
        existingRect &&
        existingRect.left === nextRect.left &&
        existingRect.top === nextRect.top &&
        existingRect.width === nextRect.width &&
        existingRect.height === nextRect.height
      ) {
        return true;
      }

      const snapshotCanvas = document.createElement("canvas");
      snapshotCanvas.width = nextRect.width;
      snapshotCanvas.height = nextRect.height;
      const snapshotCtx = snapshotCanvas.getContext("2d");
      if (!snapshotCtx) {
        return false;
      }

      snapshotCtx.setTransform(1, 0, 0, 1, 0, 0);
      snapshotCtx.clearRect(0, 0, snapshotCanvas.width, snapshotCanvas.height);
      snapshotCtx.drawImage(
        sourceCanvas,
        nextRect.left,
        nextRect.top,
        nextRect.width,
        nextRect.height,
        0,
        0,
        nextRect.width,
        nextRect.height,
      );

      if (existingCanvas && existingRect) {
        snapshotCtx.drawImage(
          existingCanvas,
          0,
          0,
          existingRect.width,
          existingRect.height,
          existingRect.left - nextRect.left,
          existingRect.top - nextRect.top,
          existingRect.width,
          existingRect.height,
        );
      }

      brushStrokeBaseCanvasRef.current = snapshotCanvas;
      brushStrokeBaseRectRef.current = nextRect;
      return true;
    },
    [mergeBrushPreviewDirtyRects],
  );

  const drawBufferedBrushStroke = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      drawSingleDot: boolean,
      mode: "buffered-main-preview" | "overlay-preview" | "final-commit" = "buffered-main-preview",
    ) => {
      const points = brushStrokePointsRef.current;
      if (points.length === 0) return;
      const useOverlayPreview = mode === "overlay-preview";
      const useBufferedMainPreview = mode === "buffered-main-preview";
      const useFinalCommit = mode === "final-commit";
      const replayEntireStroke = useOverlayPreview || useFinalCommit;
      const strokeSize = brushStrokeSizeRef.current;
      const variant = brushStrokeVariantRef.current;
      const glowGradientBrightnessValue = brushStrokeGradientBrightnessRef.current;
      const glowGradientRadiusValue = brushStrokeGradientRadiusRef.current;
      const rgbaMatch = brushStrokeColorRef.current.match(/^rgba\((\d+),(\d+),(\d+),([0-9.]+)\)$/);
      const colorR = rgbaMatch ? Number.parseInt(rgbaMatch[1], 10) : 0;
      const colorG = rgbaMatch ? Number.parseInt(rgbaMatch[2], 10) : 0;
      const colorB = rgbaMatch ? Number.parseInt(rgbaMatch[3], 10) : 0;
      const colorAlpha = rgbaMatch ? Math.max(0, Math.min(1, Number.parseFloat(rgbaMatch[4]))) : 1;
      const toRGBA = (r: number, g: number, b: number, alpha: number) =>
        `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${Math.max(0, Math.min(1, alpha))})`;
      const { renderPoints, effectiveSmoothing, segmentStartIndex } = resolveBufferedBrushRenderState(points);
      const nextGlowPathStep =
        variant === "Glow" && !drawSingleDot ? (renderPoints.length > 32 ? 3 : renderPoints.length > 14 ? 2 : 1) : 1;
      const previewSegmentStartIndex =
        replayEntireStroke
          ? 1
          : variant === "Glow" && !drawSingleDot && brushStrokeGlowPathStepRef.current !== nextGlowPathStep
          ? 1
          : segmentStartIndex;
      brushStrokeGlowPathStepRef.current = nextGlowPathStep;
      const drawStartIndex = replayEntireStroke
        ? 0
        : Math.max(0, Math.min(renderPoints.length - 1, previewSegmentStartIndex) - 1);
      const dirtyRect = resolveBrushPreviewDirtyRect(
        drawSingleDot ? points : renderPoints,
        ctx.canvas.width,
        ctx.canvas.height,
        drawSingleDot,
        drawSingleDot ? 0 : replayEntireStroke ? 0 : drawStartIndex,
      );
      if (useBufferedMainPreview) {
        if (!ensureBrushStrokeBaseRegion(ctx.canvas, dirtyRect) || !restoreBrushStrokeRegion(ctx, dirtyRect)) {
          return;
        }
      } else if (useOverlayPreview) {
        const previewClearRect = mergeBrushPreviewDirtyRects(
          brushPreviewOverlayDirtyRectRef.current,
          dirtyRect,
          ctx.canvas.width,
          ctx.canvas.height,
        );
        clearBrushPreviewOverlay(previewClearRect);
        brushPreviewOverlayDirtyRectRef.current = dirtyRect ? { ...dirtyRect } : null;
      } else if (useFinalCommit && brushStrokeBaseCanvasRef.current) {
        const restoreRect = brushStrokeBaseRectRef.current ?? dirtyRect;
        if (!restoreBrushStrokeRegion(ctx, restoreRect)) {
          return;
        }
      }
      if (!useOverlayPreview) {
        markAuthoringDirtyRegion(dirtyRect);
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.strokeStyle = brushStrokeColorRef.current;
      ctx.fillStyle = brushStrokeColorRef.current;
      ctx.lineWidth = strokeSize;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const isGlowSolidMode = variant === "Glow" && glowGradientBrightnessValue <= 0;
      const drawStrokePath = (pathPoints: CanvasPoint[]) => {
        if (pathPoints.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(pathPoints[0].x, pathPoints[0].y);
        for (let i = 1; i < pathPoints.length; i += 1) {
          ctx.lineTo(pathPoints[i].x, pathPoints[i].y);
        }
      };
      const buildVariantPath = (pathPoints: CanvasPoint[], jitterAmount: number, phase: number) => {
        if (pathPoints.length < 2 || jitterAmount <= 0) {
          return pathPoints;
        }

        return pathPoints.map((point, index) => {
          const prev = pathPoints[Math.max(0, index - 1)];
          const next = pathPoints[Math.min(pathPoints.length - 1, index + 1)];
          const dx = next.x - prev.x;
          const dy = next.y - prev.y;
          const length = Math.hypot(dx, dy) || 1;
          const normalX = -dy / length;
          const normalY = dx / length;
          const seed = Math.sin((index + 1) * 12.9898 + phase * 78.233) * 43758.5453;
          const noise = seed - Math.floor(seed);
          const offset = (noise - 0.5) * 2 * jitterAmount;
          return {
            x: point.x + normalX * offset,
            y: point.y + normalY * offset,
            pixelX: point.pixelX,
            pixelY: point.pixelY,
          };
        });
      };
      const drawVariantStroke = (
        pathPoints: CanvasPoint[],
        lineWidth: number,
        alphaMultiplier: number,
      ) => {
        if (pathPoints.length < 2) {
          return;
        }
        ctx.save();
        ctx.strokeStyle = toRGBA(colorR, colorG, colorB, colorAlpha * alphaMultiplier);
        ctx.lineWidth = lineWidth;
        drawStrokePath(pathPoints);
        ctx.stroke();
        ctx.restore();
      };

      if (drawSingleDot) {
        const dot = points[0];
        if (variant === "Pixelate") {
          const blockSize = Math.max(1, Math.round(strokeSize));
          const snappedX = Math.round((dot.x - blockSize / 2) / blockSize) * blockSize;
          const snappedY = Math.round((dot.y - blockSize / 2) / blockSize) * blockSize;
          ctx.fillRect(snappedX, snappedY, blockSize, blockSize);
          return;
        }

        if (variant === "Glow" && !isGlowSolidMode) {
          const gradientBrightness = Math.max(0, Math.min(1, glowGradientBrightnessValue / 100));
          const gradientRadius = Math.max(0, Math.min(1, glowGradientRadiusValue / 100));
          const brightnessFactor = Math.pow(gradientBrightness, 3.5);
          const haloStrength = 0.05 + gradientBrightness * 0.16 + brightnessFactor * 2.35;
          const radiusFactor = Math.pow(gradientRadius, 2.8);
          const haloSpread = 0.04 + gradientRadius * 0.12 + radiusFactor * 2.4;
          const outerRadius = Math.max(1.3, strokeSize * (1.02 + haloSpread * 2.35));
          const coreRadius = Math.max(0.58, strokeSize * 0.42);
          const glowAlpha = Math.min(1, colorAlpha * (0.014 + haloStrength * 0.45));
          const coreAlpha = Math.min(1, colorAlpha * 0.98);
          const outerGradient = ctx.createRadialGradient(dot.x, dot.y, 0, dot.x, dot.y, outerRadius);
          outerGradient.addColorStop(0, toRGBA(colorR, colorG, colorB, glowAlpha));
          outerGradient.addColorStop(0.32 + Math.min(0.3, haloSpread * 0.08), toRGBA(colorR, colorG, colorB, glowAlpha * 0.92));
          outerGradient.addColorStop(1, toRGBA(colorR, colorG, colorB, 0));

          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.fillStyle = outerGradient;
          ctx.beginPath();
          ctx.arc(dot.x, dot.y, outerRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          ctx.save();
          ctx.fillStyle = toRGBA(colorR, colorG, colorB, coreAlpha);
          ctx.beginPath();
          ctx.arc(dot.x, dot.y, coreRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          return;
        }

        const dotRadius =
          variant === "Pencil"
            ? Math.max(strokeSize * 0.42, 0.6)
            : variant === "Sketch"
              ? Math.max(strokeSize * 0.5, 0.6)
              : Math.max(strokeSize / 2, 0.5);
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dotRadius, 0, Math.PI * 2);
        ctx.fill();
        return;
      }

      if (points.length < 2) return;

      if (variant === "Pixelate") {
        const blockSize = Math.max(1, Math.round(strokeSize));
        const paintedCells = new Set<string>();
        const segmentStart = replayEntireStroke
          ? 1
          : Math.max(1, Math.min(previewSegmentStartIndex, renderPoints.length - 1));
        const startPointIndex = Math.max(0, segmentStart - 1);
        const stampPixel = (x: number, y: number) => {
          const cellX = Math.floor(x / blockSize);
          const cellY = Math.floor(y / blockSize);
          const key = `${cellX}:${cellY}`;
          if (paintedCells.has(key)) return;
          paintedCells.add(key);
          ctx.fillRect(cellX * blockSize, cellY * blockSize, blockSize, blockSize);
        };

        stampPixel(renderPoints[startPointIndex].x, renderPoints[startPointIndex].y);
        for (let i = startPointIndex + 1; i < renderPoints.length; i += 1) {
          const prev = renderPoints[i - 1];
          const current = renderPoints[i];
          const dx = current.x - prev.x;
          const dy = current.y - prev.y;
          const dist = Math.hypot(dx, dy);
          const spacingBlend = effectiveSmoothing / 100;
          const step = Math.max(1, blockSize * (0.72 + spacingBlend * 0.35));
          const steps = Math.max(1, Math.ceil(dist / step));
          for (let s = 1; s <= steps; s += 1) {
            const t = s / steps;
            stampPixel(prev.x + dx * t, prev.y + dy * t);
          }
        }
        return;
      }

      if (variant === "Sketch") {
        ctx.setLineDash([]);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        const segmentStart = replayEntireStroke
          ? 1
          : Math.max(1, Math.min(previewSegmentStartIndex, renderPoints.length - 1));
        const pathPoints = renderPoints.slice(Math.max(0, segmentStart - 1));
        drawVariantStroke(pathPoints, Math.max(1.1, strokeSize * 0.72), 0.9);
        drawVariantStroke(
          buildVariantPath(pathPoints, Math.max(0.16, strokeSize * 0.08), 0.75),
          Math.max(0.6, strokeSize * 0.34),
          0.34,
        );
        return;
      }

      if (variant === "Pencil") {
        ctx.setLineDash([]);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        const segmentStart = replayEntireStroke
          ? 1
          : Math.max(1, Math.min(previewSegmentStartIndex, renderPoints.length - 1));
        const pathPoints = renderPoints.slice(Math.max(0, segmentStart - 1));
        drawVariantStroke(pathPoints, Math.max(0.78, strokeSize * 0.48), 0.94);
        drawVariantStroke(
          buildVariantPath(pathPoints, Math.max(0.08, strokeSize * 0.05), 1.35),
          Math.max(0.42, strokeSize * 0.24),
          0.42,
        );
        return;
      }

      if (variant === "Glow" && !isGlowSolidMode) {
        const gradientBrightness = Math.max(0, Math.min(1, glowGradientBrightnessValue / 100));
        const gradientRadius = Math.max(0, Math.min(1, glowGradientRadiusValue / 100));
        const brightnessFactor = Math.pow(gradientBrightness, 3.5);
        const haloStrength = 0.05 + gradientBrightness * 0.16 + brightnessFactor * 2.35;
        const radiusFactor = Math.pow(gradientRadius, 2.8);
        const haloSpread = 0.04 + gradientRadius * 0.12 + radiusFactor * 2.4;
        const glowWidth = strokeSize * (0.95 + haloSpread * 2.7);
        const coreWidth = Math.max(0.95, strokeSize * 0.94);
        const glowAlpha = Math.min(1, colorAlpha * (0.012 + haloStrength * 0.37));
        const coreAlpha = Math.min(1, colorAlpha * 0.99);
        const glowBlur = strokeSize * (0.35 + haloSpread * 5.2);
        const glowPathStep = nextGlowPathStep;
        const segmentStart = replayEntireStroke
          ? 1
          : Math.max(1, Math.min(previewSegmentStartIndex, renderPoints.length - 1));
        const lastStableGlowPoint =
          glowPathStep === 1
            ? renderPoints[Math.max(0, segmentStart - 1)]
            : (() => {
                let point = renderPoints[0];
                for (let index = 0; index < segmentStart; index += 1) {
                  if (index === 0 || index === renderPoints.length - 1 || index % glowPathStep === 0) {
                    point = renderPoints[index];
                  }
                }
                return point;
              })();
        const glowPoints =
          glowPathStep === 1
            ? renderPoints.slice(Math.max(0, segmentStart - 1))
            : (() => {
                const partialGlowPoints: CanvasPoint[] = [lastStableGlowPoint];
                for (let index = segmentStart; index < renderPoints.length; index += 1) {
                  if (index === renderPoints.length - 1 || index % glowPathStep === 0) {
                    partialGlowPoints.push(renderPoints[index]);
                  }
                }
                return partialGlowPoints;
              })();
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.filter = `blur(${glowBlur}px)`;
        ctx.strokeStyle = toRGBA(colorR, colorG, colorB, glowAlpha);
        ctx.lineWidth = glowWidth;
        drawStrokePath(glowPoints);
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.strokeStyle = toRGBA(colorR, colorG, colorB, coreAlpha);
        ctx.lineWidth = coreWidth;
        drawStrokePath(renderPoints.slice(Math.max(0, segmentStart - 1)));
        ctx.stroke();
        ctx.restore();
        return;
      }

      ctx.setLineDash([]);
      ctx.lineWidth = strokeSize;
      ctx.beginPath();
      ctx.moveTo(renderPoints[drawStartIndex].x, renderPoints[drawStartIndex].y);
      for (let i = drawStartIndex + 1; i < renderPoints.length; i += 1) {
        ctx.lineTo(renderPoints[i].x, renderPoints[i].y);
      }
      ctx.stroke();
    },
    [
      clearBrushPreviewOverlay,
      ensureBrushStrokeBaseRegion,
      markAuthoringDirtyRegion,
      mergeBrushPreviewDirtyRects,
      resolveBrushPreviewDirtyRect,
      resolveBufferedBrushRenderState,
      restoreBrushStrokeRegion,
    ]
  );

  const flushBrushPreview = useCallback(() => {
    const useOverlayPreview = brushUsesOverlayPreviewRef.current;
    const ctx = useOverlayPreview
      ? foregroundCanvasRef.current?.getContext("2d")
      : canvasRef.current?.getContext("2d");
    if (!ctx || brushStrokePointsRef.current.length === 0) {
      return;
    }

    if (!useOverlayPreview && !brushStrokeBaseCanvasRef.current) {
      return;
    }

    drawBufferedBrushStroke(ctx, false, useOverlayPreview ? "overlay-preview" : "buffered-main-preview");
  }, [drawBufferedBrushStroke]);

  const scheduleBrushPreview = useCallback(() => {
    if (brushPreviewFrameRef.current !== null) {
      return;
    }

    brushPreviewFrameRef.current = window.requestAnimationFrame(() => {
      brushPreviewFrameRef.current = null;
      flushBrushPreview();
    });
  }, [flushBrushPreview]);

  const cancelBrushPreview = useCallback(() => {
    if (brushPreviewFrameRef.current === null) {
      return;
    }

    window.cancelAnimationFrame(brushPreviewFrameRef.current);
    brushPreviewFrameRef.current = null;
  }, []);

  const flushBrushPreviewImmediately = useCallback(() => {
    cancelBrushPreview();
    flushBrushPreview();
  }, [cancelBrushPreview, flushBrushPreview]);

  const smoothKnifePath = useCallback((path: LassoPoint[], smoothingValue: number) => {
    if (path.length < 3 || smoothingValue <= 0) return path;

    const reduced: LassoPoint[] = [path[0]];
    const MIN_SAMPLE_DISTANCE = 1.25;
    for (let i = 1; i < path.length - 1; i += 1) {
      const prev = reduced[reduced.length - 1];
      const next = path[i];
      if (Math.hypot(next.x - prev.x, next.y - prev.y) >= MIN_SAMPLE_DISTANCE) {
        reduced.push(next);
      }
    }
    reduced.push(path[path.length - 1]);

    if (reduced.length < 3) return reduced;

    let nextPath = reduced;
    const passes = Math.max(1, Math.round((smoothingValue / 100) * 4));
    const edgeWeight = 0.12 + (smoothingValue / 100) * 0.16;
    const centerWeight = 1 - edgeWeight * 2;

    for (let pass = 0; pass < passes; pass += 1) {
      if (nextPath.length < 3) break;

      const smoothed: LassoPoint[] = [nextPath[0]];
      for (let i = 1; i < nextPath.length - 1; i += 1) {
        const prev = nextPath[i - 1];
        const current = nextPath[i];
        const next = nextPath[i + 1];
        const x = prev.x * edgeWeight + current.x * centerWeight + next.x * edgeWeight;
        const y = prev.y * edgeWeight + current.y * centerWeight + next.y * edgeWeight;
        smoothed.push({
          x,
          y,
          pixelX: Math.floor(x),
          pixelY: Math.floor(y),
        });
      }
      smoothed.push(nextPath[nextPath.length - 1]);
      nextPath = smoothed;
    }

    return nextPath;
  }, []);

  const displayedKnifePath = useMemo(() => {
    if (knifePath.length < 2) return knifePath;
    if (knifeStraightLine) {
      return [knifePath[0], knifePath[knifePath.length - 1]];
    }
    return smoothKnifePath(knifePath, knifeSmoothing);
  }, [knifePath, knifeSmoothing, knifeStraightLine, smoothKnifePath]);

  const buildRoundedPolygonPath = (
    ctx: CanvasRenderingContext2D,
    points: Array<{ x: number; y: number }>,
    radius: number
  ) => {
    if (points.length < 3) return false;

    if (radius <= 0) {
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i += 1) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.closePath();
      return true;
    }

    const corners = points.map((point, index) => {
      const prev = points[(index - 1 + points.length) % points.length];
      const next = points[(index + 1) % points.length];
      const prevDx = point.x - prev.x;
      const prevDy = point.y - prev.y;
      const nextDx = next.x - point.x;
      const nextDy = next.y - point.y;
      const prevLength = Math.hypot(prevDx, prevDy) || 1;
      const nextLength = Math.hypot(nextDx, nextDy) || 1;
      const effectiveRadius = Math.min(radius, prevLength / 2, nextLength / 2);

      return {
        cornerX: point.x,
        cornerY: point.y,
        startX: point.x - (prevDx / prevLength) * effectiveRadius,
        startY: point.y - (prevDy / prevLength) * effectiveRadius,
        endX: point.x + (nextDx / nextLength) * effectiveRadius,
        endY: point.y + (nextDy / nextLength) * effectiveRadius,
      };
    });

    ctx.beginPath();
    ctx.moveTo(corners[0].endX, corners[0].endY);
    for (let i = 1; i < corners.length; i += 1) {
      ctx.lineTo(corners[i].startX, corners[i].startY);
      ctx.quadraticCurveTo(corners[i].cornerX, corners[i].cornerY, corners[i].endX, corners[i].endY);
    }
    ctx.lineTo(corners[0].startX, corners[0].startY);
    ctx.quadraticCurveTo(corners[0].cornerX, corners[0].cornerY, corners[0].endX, corners[0].endY);
    ctx.closePath();
    return true;
  };

  const buildShapePath = (
    ctx: CanvasRenderingContext2D,
    shape: DrawingShapeType,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    cornerRadius: number
  ) => {
    const minX = Math.min(startX, endX);
    const maxX = Math.max(startX, endX);
    const minY = Math.min(startY, endY);
    const maxY = Math.max(startY, endY);
    const width = maxX - minX;
    const height = maxY - minY;
    const centerX = minX + width / 2;
    const centerY = minY + height / 2;

    if (width <= 0 || height <= 0) return false;

    ctx.beginPath();
    if (shape === "Square") {
      const maxRadius = Math.min(width, height) / 2;
      const normalizedRoundness = Math.max(0, Math.min(1, cornerRadius / 100));
      const radius = Math.min(maxRadius, maxRadius * normalizedRoundness);
      if (radius <= 0) {
        ctx.rect(minX, minY, width, height);
      } else {
        ctx.moveTo(minX + radius, minY);
        ctx.lineTo(maxX - radius, minY);
        ctx.arcTo(maxX, minY, maxX, minY + radius, radius);
        ctx.lineTo(maxX, maxY - radius);
        ctx.arcTo(maxX, maxY, maxX - radius, maxY, radius);
        ctx.lineTo(minX + radius, maxY);
        ctx.arcTo(minX, maxY, minX, maxY - radius, radius);
        ctx.lineTo(minX, minY + radius);
        ctx.arcTo(minX, minY, minX + radius, minY, radius);
        ctx.closePath();
      }
    } else if (shape === "Triangle") {
      const normalizedRoundness = Math.max(0, Math.min(1, cornerRadius / 100));
      const radius = Math.min(Math.min(width, height) * 0.28 * normalizedRoundness, Math.min(width, height) / 3);
      return buildRoundedPolygonPath(
        ctx,
        [
          { x: centerX, y: minY },
          { x: minX, y: maxY },
          { x: maxX, y: maxY },
        ],
        radius
      );
    } else {
      ctx.ellipse(centerX, centerY, width / 2, height / 2, 0, 0, Math.PI * 2);
    }
    return true;
  };

  const getShapeOutlineWidth = (value: number) => (value <= 0 ? 0 : Math.max(1, value / 4));
  const applyShapeStrokeStyle = (
    ctx: CanvasRenderingContext2D,
    shape: DrawingShapeType,
    cornerRoundness: number,
    lineWidth: number
  ) => {
    ctx.lineWidth = lineWidth;
    if (
      (shape === "Square" && cornerRoundness <= 0) ||
      (shape === "Triangle" && cornerRoundness <= 0)
    ) {
      ctx.lineJoin = "miter";
      ctx.lineCap = "butt";
      ctx.miterLimit = 8;
      return;
    }

    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.miterLimit = 4;
  };

  const drawShapePreview = useCallback((
    ctx: CanvasRenderingContext2D,
    shape: DrawingShapeType,
    mode: "Draw" | "Cutout",
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ) => {
    const cornerRadius = shape === "Circle" ? 0 : shapeCornerRadius;
    if (!buildShapePath(ctx, shape, startX, startY, endX, endY, cornerRadius)) return;

    if (mode === "Cutout") {
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = "rgba(110,170,255,0.92)";
      applyShapeStrokeStyle(ctx, shape, cornerRadius, 1.5);
      ctx.stroke();
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.fillStyle = shapeFillColor;
    ctx.fill();
    ctx.restore();

    const outlineWidth = getShapeOutlineWidth(shapeOutlineThickness);
    if (outlineWidth <= 0) return;
    if (!buildShapePath(ctx, shape, startX, startY, endX, endY, cornerRadius)) return;

    ctx.save();
    ctx.strokeStyle = shapeOutlineColor;
    applyShapeStrokeStyle(ctx, shape, cornerRadius, outlineWidth);
    ctx.stroke();
    ctx.restore();
  }, [shapeCornerRadius, shapeFillColor, shapeOutlineColor, shapeOutlineThickness]);

  const commitShapeToCanvas = useCallback((
    ctx: CanvasRenderingContext2D,
    shape: DrawingShapeType,
    mode: "Draw" | "Cutout",
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ) => {
    const cornerRadius = shape === "Circle" ? 0 : shapeCornerRadius;
    if (!buildShapePath(ctx, shape, startX, startY, endX, endY, cornerRadius)) return;

    if (mode === "Cutout") {
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,1)";
      ctx.fill();
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = shapeFillColor;
    ctx.fill();
    ctx.restore();

    const outlineWidth = getShapeOutlineWidth(shapeOutlineThickness);
    if (outlineWidth <= 0) return;
    if (!buildShapePath(ctx, shape, startX, startY, endX, endY, cornerRadius)) return;

    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = shapeOutlineColor;
    applyShapeStrokeStyle(ctx, shape, cornerRadius, outlineWidth);
    ctx.stroke();
    ctx.restore();
  }, [shapeCornerRadius, shapeFillColor, shapeOutlineColor, shapeOutlineThickness]);

  const flushShapePreview = useCallback(() => {
    const ctx = canvasRef.current?.getContext("2d");
    const draft = shapeDraftRef.current;
    const baseImage = shapeDraftBaseImageRef.current;
    if (!ctx || !draft || !baseImage) {
      return;
    }

    ctx.putImageData(baseImage, 0, 0);
    drawShapePreview(ctx, shapeType, shapeMode, draft.startX, draft.startY, draft.endX, draft.endY);
  }, [drawShapePreview, shapeMode, shapeType]);

  const scheduleShapePreview = useCallback(() => {
    if (shapePreviewFrameRef.current !== null) {
      return;
    }

    shapePreviewFrameRef.current = window.requestAnimationFrame(() => {
      shapePreviewFrameRef.current = null;
      flushShapePreview();
    });
  }, [flushShapePreview]);

  const cancelShapePreview = useCallback(() => {
    if (shapePreviewFrameRef.current === null) {
      return;
    }

    window.cancelAnimationFrame(shapePreviewFrameRef.current);
    shapePreviewFrameRef.current = null;
  }, []);

  useEffect(
    () => () => {
      cancelBrushPreview();
      cancelShapePreview();
    },
    [cancelBrushPreview, cancelShapePreview],
  );

  const drawBitmapSelectionImage = useCallback((
    ctx: CanvasRenderingContext2D,
    selectionSource: HTMLCanvasElement,
    selection: ActiveBitmapTransformSelection,
  ) => {
    const displayRect = getDisplayedBitmapTransformRect(selection);
    const centerX = displayRect.x + displayRect.width / 2;
    const centerY = displayRect.y + displayRect.height / 2;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(centerX, centerY);
    ctx.rotate((selection.rotation * Math.PI) / 180);
    ctx.scale(selection.flipX ? -1 : 1, selection.flipY ? -1 : 1);
    ctx.drawImage(selectionSource, -selection.width / 2, -selection.height / 2, selection.width, selection.height);
    ctx.restore();
  }, [getDisplayedBitmapTransformRect]);

  const drawBitmapSelectionImageToAuthoringCanvas = useCallback((
    ctx: CanvasRenderingContext2D,
    selectionSource: HTMLCanvasElement,
    selection: ActiveBitmapTransformSelection,
  ) => {
    const metrics = getAuthoringMetrics();
    if (!metrics) {
      return false;
    }

    const displayRect = getDisplayedBitmapTransformRect(selection);
    const centerX = displayRect.x + displayRect.width / 2;
    const centerY = displayRect.y + displayRect.height / 2;
    ctx.save();
    ctx.setTransform(metrics.scaleX, 0, 0, metrics.scaleY, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.translate(centerX, centerY);
    ctx.rotate((selection.rotation * Math.PI) / 180);
    ctx.scale(selection.flipX ? -1 : 1, selection.flipY ? -1 : 1);
    ctx.drawImage(selectionSource, -selection.width / 2, -selection.height / 2, selection.width, selection.height);
    ctx.restore();
    return true;
  }, [getAuthoringMetrics, getDisplayedBitmapTransformRect]);

  const cloneBitmapSelectionSourceCanvas = useCallback((sourceCanvas: HTMLCanvasElement) => {
    const clonedCanvas = document.createElement("canvas");
    clonedCanvas.width = sourceCanvas.width;
    clonedCanvas.height = sourceCanvas.height;
    const clonedCtx = clonedCanvas.getContext("2d");
    if (!clonedCtx) {
      return null;
    }
    clonedCtx.drawImage(sourceCanvas, 0, 0);
    return clonedCanvas;
  }, []);

  const captureBitmapSelectionBackdropFromCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      bitmapSelectionBackdropCanvasRef.current = null;
      return false;
    }

    const backdropCanvas = cloneBitmapSelectionSourceCanvas(canvas);
    if (!backdropCanvas) {
      bitmapSelectionBackdropCanvasRef.current = null;
      return false;
    }

    bitmapSelectionBackdropCanvasRef.current = backdropCanvas;
    return true;
  }, [cloneBitmapSelectionSourceCanvas]);

  const restoreBitmapSelectionBackdropToCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const backdropCanvas = bitmapSelectionBackdropCanvasRef.current;
    if (!canvas || !ctx || !backdropCanvas) {
      return false;
    }

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(backdropCanvas, 0, 0, canvas.width, canvas.height);
    ctx.restore();
    return true;
  }, []);

  useEffect(() => {
    restoreBitmapSelectionBackdropToCanvasRef.current = restoreBitmapSelectionBackdropToCanvas;
  }, [restoreBitmapSelectionBackdropToCanvas]);

  const scheduleBitmapSelectionBackdropRestore = useCallback(() => {
    if (bitmapSelectionBackdropRestoreFrameRef.current !== null) {
      window.cancelAnimationFrame(bitmapSelectionBackdropRestoreFrameRef.current);
    }

    let remainingFrames = 2;
    const runRestore = () => {
      restoreBitmapSelectionBackdropToCanvas();
      remainingFrames -= 1;
      if (remainingFrames > 0) {
        bitmapSelectionBackdropRestoreFrameRef.current = window.requestAnimationFrame(runRestore);
        return;
      }
      bitmapSelectionBackdropRestoreFrameRef.current = null;
    };

    bitmapSelectionBackdropRestoreFrameRef.current = window.requestAnimationFrame(runRestore);
  }, [restoreBitmapSelectionBackdropToCanvas]);

  useEffect(() => () => {
    if (bitmapSelectionBackdropRestoreFrameRef.current !== null) {
      window.cancelAnimationFrame(bitmapSelectionBackdropRestoreFrameRef.current);
      bitmapSelectionBackdropRestoreFrameRef.current = null;
    }
  }, []);

  const getBitmapSelectionSessionForOwner = useCallback((owner: BitmapSelectionOwner) => {
    const session = bitmapSelectionSessionRef.current;
    if (!session || session.owner !== owner || session.items.length === 0) {
      return null;
    }
    return session;
  }, []);

  const getBitmapSelectionSessionItem = useCallback((
    owner: BitmapSelectionOwner,
    itemId: string,
  ): BitmapSelectionSessionItem | null => {
    const session = getBitmapSelectionSessionForOwner(owner);
    if (!session) {
      return null;
    }
    return session.items.find((item) => item.id === itemId) ?? null;
  }, [getBitmapSelectionSessionForOwner]);

  const updateBitmapSelectionSessionItem = useCallback((
    owner: BitmapSelectionOwner,
    itemId: string,
    updater: (item: BitmapSelectionSessionItem) => BitmapSelectionSessionItem,
  ) => {
    updateBitmapSelectionSessionState((session) => {
      if (!session || session.owner !== owner) {
        return session;
      }

      let didChange = false;
      const nextItems = session.items.map((item) => {
        if (item.id !== itemId) {
          return item;
        }
        const nextItem = updater(item);
        if (nextItem !== item) {
          didChange = true;
        }
        return nextItem;
      });

      return didChange
        ? {
            ...session,
            items: nextItems,
          }
        : session;
    });
  }, [updateBitmapSelectionSessionState]);

  const commitBitmapSelectionSessionToCanvas = useCallback((
    owner: BitmapSelectionOwner,
    options?: { clearSelection?: boolean; commitHistory?: boolean },
  ) => {
    const session = getBitmapSelectionSessionForOwner(owner);
    const ctx = canvasRef.current?.getContext("2d");
    if (!session) {
      if (options?.clearSelection ?? true) {
        setBitmapSelectionSessionState(null);
      }
      return true;
    }
    if (!ctx) {
      return false;
    }

    ctx.globalCompositeOperation = "source-over";
    for (const item of session.items) {
      drawBitmapSelectionImageToAuthoringCanvas(ctx, item.sourceCanvas, item);
    }
    markAuthoringDirty();
    if (options?.commitHistory) {
      onAuthoringActionCommitted?.("selection");
    }
    if (options?.clearSelection ?? true) {
      setBitmapSelectionSessionState(null);
    }
    return true;
  }, [drawBitmapSelectionImageToAuthoringCanvas, getBitmapSelectionSessionForOwner, markAuthoringDirty, onAuthoringActionCommitted, setBitmapSelectionSessionState]);

  const commitActiveBitmapSelectionSessionToCanvas = useCallback((
    options?: { clearSelection?: boolean; commitHistory?: boolean },
  ) => {
    const session = bitmapSelectionSessionRef.current;
    if (!session) {
      return true;
    }
    return commitBitmapSelectionSessionToCanvas(session.owner, options);
  }, [commitBitmapSelectionSessionToCanvas]);

  useEffect(() => {
    commitActiveBitmapSelectionSessionRef.current = commitActiveBitmapSelectionSessionToCanvas;
  }, [commitActiveBitmapSelectionSessionToCanvas]);

  const duplicateBitmapSelectionSession = useCallback((owner: BitmapSelectionOwner) => {
    const session = getBitmapSelectionSessionForOwner(owner);
    const ctx = canvasRef.current?.getContext("2d");
    if (!session || !ctx) {
      return false;
    }

    ctx.globalCompositeOperation = "source-over";
    for (const item of session.items) {
      drawBitmapSelectionImageToAuthoringCanvas(ctx, item.sourceCanvas, item);
    }
    markAuthoringDirty();
    onAuthoringActionCommitted?.("selection");
    captureBitmapSelectionBackdropFromCanvas();

    const duplicatedItems = session.items.map((item) => {
      const duplicatedSourceCanvas = cloneBitmapSelectionSourceCanvas(item.sourceCanvas);
      if (!duplicatedSourceCanvas) {
        return null;
      }
      return {
        ...item,
        id: createBitmapSelectionSessionItemId(),
        sourceCanvas: duplicatedSourceCanvas,
        x: item.x + 16,
        y: item.y + 16,
      };
    }).filter((item): item is BitmapSelectionSessionItem => Boolean(item));

    if (duplicatedItems.length !== session.items.length) {
      return false;
    }

    flushBitmapSelectionSessionState({
      owner,
      items: duplicatedItems,
    });
    scheduleBitmapSelectionBackdropRestore();
    return true;
  }, [captureBitmapSelectionBackdropFromCanvas, cloneBitmapSelectionSourceCanvas, createBitmapSelectionSessionItemId, drawBitmapSelectionImageToAuthoringCanvas, flushBitmapSelectionSessionState, getBitmapSelectionSessionForOwner, markAuthoringDirty, onAuthoringActionCommitted, scheduleBitmapSelectionBackdropRestore]);

  const deleteBitmapSelectionSession = useCallback((owner: BitmapSelectionOwner) => {
    const session = getBitmapSelectionSessionForOwner(owner);
    if (!session) {
      return false;
    }

    markAuthoringDirty();
    setBitmapSelectionSessionState(null);
    onAuthoringActionCommitted?.("selection");
    return true;
  }, [getBitmapSelectionSessionForOwner, markAuthoringDirty, onAuthoringActionCommitted, setBitmapSelectionSessionState]);

  const commitLassoSelectionToCanvas = useCallback(() => {
    const selection = activeLassoSelectionRef.current;
    if (!selection) {
      return selectionSourceCanvasRef.current ? false : true;
    }
    if (selection.kind !== "bitmap") {
      return false;
    }
    return commitBitmapSelectionSessionToCanvas("lasso", { clearSelection: true, commitHistory: false });
  }, [commitBitmapSelectionSessionToCanvas]);

  const commitBoxSelectionToCanvas = useCallback(() => {
    const selection = activeBoxSelectionRef.current;
    if (!selection) {
      if (boxSelectionSourceCanvasRef.current) {
        return false;
      }
      resetBoxSelectionState();
      return true;
    }
    if (selection.kind !== "bitmap") {
      return false;
    }
    return commitBitmapSelectionSessionToCanvas("select", { clearSelection: true, commitHistory: false });
  }, [commitBitmapSelectionSessionToCanvas, resetBoxSelectionState]);

  const setActiveBitmapBoxSelectionState = useCallback((selection: ActiveBoxBitmapSelection) => {
    const currentSession = bitmapSelectionSessionRef.current;
    const currentItem = currentSession?.owner === "select" ? currentSession.items[0] ?? null : null;
    const sourceCanvas = currentItem?.sourceCanvas ?? boxSelectionSourceCanvasRef.current;
    if (!sourceCanvas) {
      setActiveBoxSelectionState(selection);
      return;
    }

    setBitmapSelectionSessionState({
      owner: "select",
      items: [{
        id: currentItem?.id ?? createBitmapSelectionSessionItemId(),
        sourceCanvas,
        allowRotation: true,
        ...selection,
      }],
    });
  }, [createBitmapSelectionSessionItemId, setActiveBoxSelectionState, setBitmapSelectionSessionState]);

  const deselectBoxSelection = useCallback(() => {
    if (activeBoxSelectionRef.current?.kind === "text") {
      clearTextSelectionState();
      return true;
    }

    return commitBoxSelectionToCanvas();
  }, [clearTextSelectionState, commitBoxSelectionToCanvas]);

  useEffect(() => {
    dismissBoxSelectionRef.current = deselectBoxSelection;
  }, [deselectBoxSelection]);

  const deselectLassoSelection = useCallback(() => {
    if (activeLassoSelectionRef.current?.kind === "text") {
      clearTextSelectionState();
      clearLassoDraft();
      return true;
    }
    const didCommit = commitLassoSelectionToCanvas();
    if (didCommit) {
      clearLassoDraft();
    }
    return didCommit;
  }, [clearLassoDraft, clearTextSelectionState, commitLassoSelectionToCanvas]);

  const duplicateLassoSelection = useCallback(() => {
    const selection = activeLassoSelectionRef.current;
    if (selection?.kind === "text") {
      duplicateSelectedTextObjects(selection.objectIds, "lasso");
      return;
    }
    duplicateBitmapSelectionSession("lasso");
  }, [duplicateBitmapSelectionSession, duplicateSelectedTextObjects]);

  const deleteLassoSelection = useCallback(() => {
    if (!activeLassoSelectionRef.current) return;
    if (activeLassoSelectionRef.current.kind === "text") {
      const didDelete = deleteSelectedTextObjects(activeLassoSelectionRef.current.objectIds);
      if (didDelete) {
        selectionSourceCanvasRef.current = null;
        setActiveLassoSelectionState(null);
        clearLassoDraft();
      }
      return;
    }
    deleteBitmapSelectionSession("lasso");
    clearLassoDraft();
  }, [clearLassoDraft, deleteBitmapSelectionSession, deleteSelectedTextObjects]);

  const commitKnifePiecesToCanvas = useCallback((options?: { clearSelection?: boolean; commitHistory?: boolean }) => {
    return commitBitmapSelectionSessionToCanvas("knife", options);
  }, [commitBitmapSelectionSessionToCanvas]);

  const getActiveKnifeSelectionTarget = useCallback(() => {
    const session = getBitmapSelectionSessionForOwner("knife");
    if (!session || session.items.length === 0) {
      return { session: null, activeItem: null };
    }

    const activeItem =
      activeKnifePieceIdRef.current != null
        ? session.items.find((item) => item.id === activeKnifePieceIdRef.current) ?? null
        : session.items.length === 1
          ? session.items[0] ?? null
          : null;

    return {
      session,
      activeItem,
    };
  }, [getBitmapSelectionSessionForOwner]);

  const deselectKnifePieces = useCallback(() => {
    const { session, activeItem } = getActiveKnifeSelectionTarget();
    if (!session || !activeItem || session.items.length <= 1) {
      return commitKnifePiecesToCanvas({ clearSelection: true, commitHistory: false });
    }

    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) {
      return false;
    }

    drawBitmapSelectionImageToAuthoringCanvas(ctx, activeItem.sourceCanvas, activeItem);
    markAuthoringDirty();
    captureBitmapSelectionBackdropFromCanvas();

    const remainingItems = session.items.filter((item) => item.id !== activeItem.id);
    setBitmapSelectionSessionState(
      remainingItems.length > 0
        ? {
            owner: "knife",
            items: remainingItems,
          }
        : null,
    );
    return true;
  }, [captureBitmapSelectionBackdropFromCanvas, commitKnifePiecesToCanvas, drawBitmapSelectionImageToAuthoringCanvas, getActiveKnifeSelectionTarget, markAuthoringDirty, setBitmapSelectionSessionState]);

  const duplicateKnifePieces = useCallback(() => {
    const { session, activeItem } = getActiveKnifeSelectionTarget();
    if (!session || !activeItem || session.items.length <= 1) {
      return duplicateBitmapSelectionSession("knife");
    }

    const duplicatedSourceCanvas = cloneBitmapSelectionSourceCanvas(activeItem.sourceCanvas);
    if (!duplicatedSourceCanvas) {
      return false;
    }

    const duplicatedItem: BitmapSelectionSessionItem = {
      ...activeItem,
      id: createBitmapSelectionSessionItemId(),
      sourceCanvas: duplicatedSourceCanvas,
      x: activeItem.x + 16,
      y: activeItem.y + 16,
    };

    markAuthoringDirty();
    onAuthoringActionCommitted?.("selection");
    setBitmapSelectionSessionState({
      owner: "knife",
      items: [...session.items, duplicatedItem],
    });
    setActiveKnifePieceIdState(duplicatedItem.id);
    return true;
  }, [cloneBitmapSelectionSourceCanvas, createBitmapSelectionSessionItemId, duplicateBitmapSelectionSession, getActiveKnifeSelectionTarget, markAuthoringDirty, onAuthoringActionCommitted, setActiveKnifePieceIdState, setBitmapSelectionSessionState]);

  const flipKnifePieces = useCallback((axis: "x" | "y") => {
    const { session, activeItem } = getActiveKnifeSelectionTarget();
    if (!session) {
      return false;
    }

    const targetItemIds = new Set(
      activeItem ? [activeItem.id] : session.items.map((item) => item.id),
    );
    let didFlip = false;
    const nextItems = session.items.map((item) => {
      if (!targetItemIds.has(item.id)) {
        return item;
      }

      didFlip = true;
      return {
        ...item,
        ...resolveBitmapSelectionWithPreservedCenter(item, {
          flipX: axis === "x" ? !item.flipX : item.flipX,
          flipY: axis === "y" ? !item.flipY : item.flipY,
        }),
      };
    });

    if (!didFlip) {
      return false;
    }

    restoreBitmapSelectionBackdropToCanvasRef.current();
    setBitmapSelectionSessionState({
      ...session,
      items: nextItems,
    });
    return true;
  }, [getActiveKnifeSelectionTarget, resolveBitmapSelectionWithPreservedCenter, setBitmapSelectionSessionState]);

  const deleteKnifePieces = useCallback(() => {
    const { session, activeItem } = getActiveKnifeSelectionTarget();
    if (!session || !activeItem || session.items.length <= 1) {
      deleteBitmapSelectionSession("knife");
      return;
    }

    markAuthoringDirty();
    onAuthoringActionCommitted?.("selection");
    setBitmapSelectionSessionState({
      owner: "knife",
      items: session.items.filter((item) => item.id !== activeItem.id),
    });
  }, [deleteBitmapSelectionSession, getActiveKnifeSelectionTarget, markAuthoringDirty, onAuthoringActionCommitted, setBitmapSelectionSessionState]);

  const createKnifeCutSelection = useCallback((path: LassoPoint[]) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const metrics = getAuthoringMetrics();
    if (!canvas || !ctx || !metrics || path.length < 2) return;
    const cssToPixelX = metrics.scaleX;
    const cssToPixelY = metrics.scaleY;
    const rawPath = path.map((p) => ({
      x: p.x * cssToPixelX,
      y: p.y * cssToPixelY,
    }));

    const width = canvas.width;
    const height = canvas.height;
    const totalPixels = width * height;
    const sourceImage = ctx.getImageData(0, 0, width, height);
    const sourceData = sourceImage.data;
    const alphaMask = new Uint8Array(totalPixels);
    for (let i = 0; i < totalPixels; i += 1) {
      alphaMask[i] = sourceData[i * 4 + 3] > 0 ? 1 : 0;
    }

    const makeStrokeMask = (strokeWidth: number) => {
      const maskCanvas = document.createElement("canvas");
      maskCanvas.width = width;
      maskCanvas.height = height;
      const maskCtx = maskCanvas.getContext("2d");
      if (!maskCtx) return null;
      maskCtx.beginPath();
      maskCtx.lineCap = "round";
      maskCtx.lineJoin = "round";
      maskCtx.strokeStyle = "#ffffff";
      maskCtx.lineWidth = strokeWidth;
      maskCtx.moveTo(rawPath[0].x, rawPath[0].y);
      for (let i = 1; i < rawPath.length; i += 1) {
        maskCtx.lineTo(rawPath[i].x, rawPath[i].y);
      }
      maskCtx.stroke();
      const data = maskCtx.getImageData(0, 0, width, height).data;
      const mask = new Uint8Array(totalPixels);
      for (let i = 0; i < totalPixels; i += 1) {
        mask[i] = data[i * 4 + 3] > 0 ? 1 : 0;
      }
      return mask;
    };

    const centerCutMask = makeStrokeMask(2);
    if (!centerCutMask) return;

    const neighbors = (index: number) => {
      const x = index % width;
      const y = Math.floor(index / width);
      const result: number[] = [];
      if (x > 0) result.push(index - 1);
      if (x < width - 1) result.push(index + 1);
      if (y > 0) result.push(index - width);
      if (y < height - 1) result.push(index + width);
      return result;
    };

    const touchedIndexes: number[] = [];
    for (let i = 0; i < totalPixels; i += 1) {
      if (alphaMask[i] && centerCutMask[i]) touchedIndexes.push(i);
    }
    if (!touchedIndexes.length) return;

    const visited = new Uint8Array(totalPixels);
    const targetMask = new Uint8Array(totalPixels);
    let bestTouchedCount = 0;
    let bestComponentSize = 0;

    for (const seed of touchedIndexes) {
      if (visited[seed] || !alphaMask[seed]) continue;
      const queue = [seed];
      const component: number[] = [];
      let touchedCount = 0;
      visited[seed] = 1;

      while (queue.length) {
        const idx = queue.pop();
        if (idx === undefined) continue;
        component.push(idx);
        if (centerCutMask[idx]) touchedCount += 1;

        for (const nextIdx of neighbors(idx)) {
          if (visited[nextIdx] || !alphaMask[nextIdx]) continue;
          visited[nextIdx] = 1;
          queue.push(nextIdx);
        }
      }

      if (touchedCount > bestTouchedCount || (touchedCount === bestTouchedCount && component.length > bestComponentSize)) {
        bestTouchedCount = touchedCount;
        bestComponentSize = component.length;
        targetMask.fill(0);
        for (const idx of component) {
          targetMask[idx] = 1;
        }
      }
    }

    if (!bestComponentSize) return;

    const segments: Array<{ ax: number; ay: number; dx: number; dy: number; lengthSq: number }> = [];
    for (let i = 1; i < rawPath.length; i += 1) {
      const ax = rawPath[i - 1].x;
      const ay = rawPath[i - 1].y;
      const dx = rawPath[i].x - ax;
      const dy = rawPath[i].y - ay;
      const lengthSq = dx * dx + dy * dy;
      if (lengthSq < 0.0001) continue;
      segments.push({ ax, ay, dx, dy, lengthSq });
    }
    if (!segments.length) return;

    const getSideValueAtPoint = (x: number, y: number) => {
      let nearestDistanceSq = Number.POSITIVE_INFINITY;
      let sideValue = 0;
      for (const segment of segments) {
        const apx = x - segment.ax;
        const apy = y - segment.ay;
        const rawT = (apx * segment.dx + apy * segment.dy) / segment.lengthSq;
        const t = Math.max(0, Math.min(1, rawT));
        const closestX = segment.ax + t * segment.dx;
        const closestY = segment.ay + t * segment.dy;
        const dx = x - closestX;
        const dy = y - closestY;
        const distanceSq = dx * dx + dy * dy;
        if (distanceSq < nearestDistanceSq) {
          nearestDistanceSq = distanceSq;
          sideValue = apx * segment.dy - apy * segment.dx;
        }
      }
      return sideValue;
    };

    let sideOneMask: Uint8Array | null = null;
    let sideTwoMask: Uint8Array | null = null;

    for (const corridorWidth of [2.5, 3.5, 5, 6.5, 8]) {
      const corridorMask = makeStrokeMask(corridorWidth);
      if (!corridorMask) continue;

      const cuttableMask = new Uint8Array(totalPixels);
      for (let i = 0; i < totalPixels; i += 1) {
        cuttableMask[i] = targetMask[i] && !corridorMask[i] ? 1 : 0;
      }

      const compIdMap = new Int32Array(totalPixels);
      compIdMap.fill(-1);
      const components: Array<{ id: number; pixels: number[]; sumX: number; sumY: number }> = [];

      for (let i = 0; i < totalPixels; i += 1) {
        if (!cuttableMask[i] || compIdMap[i] !== -1) continue;
        const compId = components.length;
        const queue = [i];
        const pixels: number[] = [];
        let sumX = 0;
        let sumY = 0;
        compIdMap[i] = compId;

        while (queue.length) {
          const idx = queue.pop();
          if (idx === undefined) continue;
          pixels.push(idx);
          const x = idx % width;
          const y = Math.floor(idx / width);
          sumX += x;
          sumY += y;

          for (const nextIdx of neighbors(idx)) {
            if (!cuttableMask[nextIdx] || compIdMap[nextIdx] !== -1) continue;
            compIdMap[nextIdx] = compId;
            queue.push(nextIdx);
          }
        }

        components.push({ id: compId, pixels, sumX, sumY });
      }

      if (components.length < 2) continue;

      const sideOneCompIds = new Set<number>();
      const sideTwoCompIds = new Set<number>();

      for (const comp of components) {
        const cx = comp.sumX / comp.pixels.length;
        const cy = comp.sumY / comp.pixels.length;
        const sideValue = getSideValueAtPoint(cx, cy);
        if (sideValue >= 0) sideOneCompIds.add(comp.id);
        else sideTwoCompIds.add(comp.id);
      }

      if (!sideOneCompIds.size || !sideTwoCompIds.size) continue;

      const sideOneCandidate = new Uint8Array(totalPixels);
      const sideTwoCandidate = new Uint8Array(totalPixels);
      for (let i = 0; i < totalPixels; i += 1) {
        if (!targetMask[i]) continue;
        const compId = compIdMap[i];
        if (compId !== -1) {
          if (sideOneCompIds.has(compId)) sideOneCandidate[i] = 1;
          else if (sideTwoCompIds.has(compId)) sideTwoCandidate[i] = 1;
        }
      }

      let sideOneCount = 0;
      let sideTwoCount = 0;
      for (let i = 0; i < totalPixels; i += 1) {
        if (sideOneCandidate[i]) sideOneCount += 1;
        if (sideTwoCandidate[i]) sideTwoCount += 1;
      }
      if (!sideOneCount || !sideTwoCount) continue;

      sideOneMask = sideOneCandidate;
      sideTwoMask = sideTwoCandidate;
      break;
    }

    if (!sideOneMask || !sideTwoMask) return;

    let sideOneMinX = width;
    let sideOneMinY = height;
    let sideOneMaxX = -1;
    let sideOneMaxY = -1;
    let sideTwoMinX = width;
    let sideTwoMinY = height;
    let sideTwoMaxX = -1;
    let sideTwoMaxY = -1;

    const clearedImage = new ImageData(new Uint8ClampedArray(sourceData), width, height);
    for (let i = 0; i < totalPixels; i += 1) {
      if (!targetMask[i]) continue;
      const x = i % width;
      const y = Math.floor(i / width);
      if (sideOneMask[i]) {
        if (x < sideOneMinX) sideOneMinX = x;
        if (y < sideOneMinY) sideOneMinY = y;
        if (x > sideOneMaxX) sideOneMaxX = x;
        if (y > sideOneMaxY) sideOneMaxY = y;
      } else if (sideTwoMask[i]) {
        if (x < sideTwoMinX) sideTwoMinX = x;
        if (y < sideTwoMinY) sideTwoMinY = y;
        if (x > sideTwoMaxX) sideTwoMaxX = x;
        if (y > sideTwoMaxY) sideTwoMaxY = y;
      }

      const srcIndex = i * 4;
      clearedImage.data[srcIndex] = 0;
      clearedImage.data[srcIndex + 1] = 0;
      clearedImage.data[srcIndex + 2] = 0;
      clearedImage.data[srcIndex + 3] = 0;
    }

    if (sideOneMaxX < sideOneMinX || sideTwoMaxX < sideTwoMinX) return;

    const sideOneWidth = sideOneMaxX - sideOneMinX + 1;
    const sideOneHeight = sideOneMaxY - sideOneMinY + 1;
    const sideTwoWidth = sideTwoMaxX - sideTwoMinX + 1;
    const sideTwoHeight = sideTwoMaxY - sideTwoMinY + 1;
    const sideOneImage = new ImageData(sideOneWidth, sideOneHeight);
    const sideTwoImage = new ImageData(sideTwoWidth, sideTwoHeight);

    for (let i = 0; i < totalPixels; i += 1) {
      const src = i * 4;
      if (sideOneMask[i]) {
        const x = i % width;
        const y = Math.floor(i / width);
        const tx = x - sideOneMinX;
        const ty = y - sideOneMinY;
        const dst = (ty * sideOneWidth + tx) * 4;
        sideOneImage.data[dst] = sourceData[src];
        sideOneImage.data[dst + 1] = sourceData[src + 1];
        sideOneImage.data[dst + 2] = sourceData[src + 2];
        sideOneImage.data[dst + 3] = sourceData[src + 3];
      } else if (sideTwoMask[i]) {
        const x = i % width;
        const y = Math.floor(i / width);
        const tx = x - sideTwoMinX;
        const ty = y - sideTwoMinY;
        const dst = (ty * sideTwoWidth + tx) * 4;
        sideTwoImage.data[dst] = sourceData[src];
        sideTwoImage.data[dst + 1] = sourceData[src + 1];
        sideTwoImage.data[dst + 2] = sourceData[src + 2];
        sideTwoImage.data[dst + 3] = sourceData[src + 3];
      }
    }

    const smoothPieceEdges = (image: ImageData) => {
      const { width: pieceWidth, height: pieceHeight, data } = image;
      const original = new Uint8ClampedArray(data);
      for (let y = 0; y < pieceHeight; y += 1) {
        for (let x = 0; x < pieceWidth; x += 1) {
          const idx = (y * pieceWidth + x) * 4;
          const alpha = original[idx + 3];
          if (alpha === 0) continue;

          let hasTransparentNeighbor = false;
          let alphaSum = 0;
          let sampleCount = 0;

          for (let ny = Math.max(0, y - 1); ny <= Math.min(pieceHeight - 1, y + 1); ny += 1) {
            for (let nx = Math.max(0, x - 1); nx <= Math.min(pieceWidth - 1, x + 1); nx += 1) {
              const nIdx = (ny * pieceWidth + nx) * 4;
              const nAlpha = original[nIdx + 3];
              alphaSum += nAlpha;
              sampleCount += 1;
              if (nAlpha === 0) hasTransparentNeighbor = true;
            }
          }

          if (!hasTransparentNeighbor) continue;
          const avgAlpha = Math.round(alphaSum / sampleCount);
          data[idx + 3] = Math.max(96, Math.round(alpha * 0.7 + avgAlpha * 0.3));
        }
      }
    };

    smoothPieceEdges(sideOneImage);
    smoothPieceEdges(sideTwoImage);

    const sideOneCanvas = document.createElement("canvas");
    sideOneCanvas.width = sideOneWidth;
    sideOneCanvas.height = sideOneHeight;
    const sideOneCtx = sideOneCanvas.getContext("2d");
    if (!sideOneCtx) return;
    sideOneCtx.putImageData(sideOneImage, 0, 0);

    const sideTwoCanvas = document.createElement("canvas");
    sideTwoCanvas.width = sideTwoWidth;
    sideTwoCanvas.height = sideTwoHeight;
    const sideTwoCtx = sideTwoCanvas.getContext("2d");
    if (!sideTwoCtx) return;
    sideTwoCtx.putImageData(sideTwoImage, 0, 0);

    ctx.putImageData(clearedImage, 0, 0);
    markAuthoringDirty();
    captureBitmapSelectionBackdropFromCanvas();

    let sideOneSumX = 0;
    let sideOneSumY = 0;
    let sideTwoSumX = 0;
    let sideTwoSumY = 0;
    let sideOneCount = 0;
    let sideTwoCount = 0;
    for (let i = 0; i < totalPixels; i += 1) {
      if (sideOneMask[i]) {
        sideOneSumX += i % width;
        sideOneSumY += Math.floor(i / width);
        sideOneCount += 1;
      } else if (sideTwoMask[i]) {
        sideTwoSumX += i % width;
        sideTwoSumY += Math.floor(i / width);
        sideTwoCount += 1;
      }
    }

    let separationDirX = sideOneCount && sideTwoCount ? sideOneSumX / sideOneCount - sideTwoSumX / sideTwoCount : 0;
    let separationDirY = sideOneCount && sideTwoCount ? sideOneSumY / sideOneCount - sideTwoSumY / sideTwoCount : 0;
    if (Math.hypot(separationDirX, separationDirY) < 0.001) {
      let tangentX = rawPath[rawPath.length - 1].x - rawPath[0].x;
      let tangentY = rawPath[rawPath.length - 1].y - rawPath[0].y;
      if (Math.hypot(tangentX, tangentY) < 0.001 && rawPath.length > 2) {
        tangentX = rawPath[rawPath.length - 1].x - rawPath[Math.floor(rawPath.length / 2)].x;
        tangentY = rawPath[rawPath.length - 1].y - rawPath[Math.floor(rawPath.length / 2)].y;
      }
      const tangentLength = Math.hypot(tangentX, tangentY);
      if (tangentLength < 0.001) return;
      separationDirX = -tangentY / tangentLength;
      separationDirY = tangentX / tangentLength;
    } else {
      const dirLength = Math.hypot(separationDirX, separationDirY);
      separationDirX /= dirLength;
      separationDirY /= dirLength;
    }

    const separationDistance = 14;
    const separationOffsetX = (separationDirX * separationDistance) / cssToPixelX;
    const separationOffsetY = (separationDirY * separationDistance) / cssToPixelY;
    const nextKnifeItems: BitmapSelectionSessionItem[] = [
      {
        id: createBitmapSelectionSessionItemId(),
        sourceCanvas: sideOneCanvas,
        x: sideOneMinX / cssToPixelX + separationOffsetX,
        y: sideOneMinY / cssToPixelY + separationOffsetY,
        width: sideOneWidth / cssToPixelX,
        height: sideOneHeight / cssToPixelY,
        flipX: false,
        flipY: false,
        rotation: 0,
        allowRotation: true,
      },
      {
        id: createBitmapSelectionSessionItemId(),
        sourceCanvas: sideTwoCanvas,
        x: sideTwoMinX / cssToPixelX - separationOffsetX,
        y: sideTwoMinY / cssToPixelY - separationOffsetY,
        width: sideTwoWidth / cssToPixelX,
        height: sideTwoHeight / cssToPixelY,
        flipX: false,
        flipY: false,
        rotation: 0,
        allowRotation: true,
      },
    ];
    flushBitmapSelectionSessionState({
      owner: "knife",
      items: nextKnifeItems,
    });
    onAuthoringActionCommitted?.("knife");
    scheduleBitmapSelectionBackdropRestore();
  }, [captureBitmapSelectionBackdropFromCanvas, createBitmapSelectionSessionItemId, flushBitmapSelectionSessionState, getAuthoringMetrics, markAuthoringDirty, onAuthoringActionCommitted, scheduleBitmapSelectionBackdropRestore]);

  const createLassoSelection = useCallback((path: LassoPoint[]) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const metrics = getAuthoringMetrics();
    if (!canvas || !ctx || !metrics || path.length < 3) return;

    const textObjectIds = findTextObjectIdsInLassoPath(path, displayedTextObjects);

    const minPixelX = Math.max(0, Math.floor(Math.min(...path.map((p) => p.pixelX))));
    const maxPixelX = Math.min(canvas.width - 1, Math.ceil(Math.max(...path.map((p) => p.pixelX))));
    const minPixelY = Math.max(0, Math.floor(Math.min(...path.map((p) => p.pixelY))));
    const maxPixelY = Math.min(canvas.height - 1, Math.ceil(Math.max(...path.map((p) => p.pixelY))));
    const boxWidth = maxPixelX - minPixelX + 1;
    const boxHeight = maxPixelY - minPixelY + 1;

    if (boxWidth < 4 || boxHeight < 4) return;

    const basePatch = ctx.getImageData(minPixelX, minPixelY, boxWidth, boxHeight);
    const selectedPatch = new ImageData(boxWidth, boxHeight);

    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = boxWidth;
    maskCanvas.height = boxHeight;
    const maskCtx = maskCanvas.getContext("2d");
    if (!maskCtx) return;

    maskCtx.beginPath();
    maskCtx.moveTo(path[0].pixelX - minPixelX, path[0].pixelY - minPixelY);
    for (let i = 1; i < path.length; i += 1) {
      maskCtx.lineTo(path[i].pixelX - minPixelX, path[i].pixelY - minPixelY);
    }
    maskCtx.closePath();
    maskCtx.fillStyle = "#ffffff";
    maskCtx.fill();

    const maskData = maskCtx.getImageData(0, 0, boxWidth, boxHeight).data;

    let hasAnySelection = false;
    let selectedOpaquePixelCount = 0;
    let trimMinX = boxWidth;
    let trimMinY = boxHeight;
    let trimMaxX = -1;
    let trimMaxY = -1;

    for (let y = 0; y < boxHeight; y += 1) {
      for (let x = 0; x < boxWidth; x += 1) {
        const idx = (y * boxWidth + x) * 4;
        const isInsideMask = maskData[idx + 3] > 0;
        const sourceAlpha = basePatch.data[idx + 3];

        if (!isInsideMask || sourceAlpha === 0) continue;

        selectedPatch.data[idx] = basePatch.data[idx];
        selectedPatch.data[idx + 1] = basePatch.data[idx + 1];
        selectedPatch.data[idx + 2] = basePatch.data[idx + 2];
        selectedPatch.data[idx + 3] = basePatch.data[idx + 3];

        basePatch.data[idx] = 0;
        basePatch.data[idx + 1] = 0;
        basePatch.data[idx + 2] = 0;
        basePatch.data[idx + 3] = 0;

        hasAnySelection = true;
        selectedOpaquePixelCount += 1;
        if (x < trimMinX) trimMinX = x;
        if (y < trimMinY) trimMinY = y;
        if (x > trimMaxX) trimMaxX = x;
        if (y > trimMaxY) trimMaxY = y;
      }
    }

    const shouldPreferTextSelection =
      textObjectIds.length > 0 &&
      (!hasAnySelection || selectedOpaquePixelCount < Math.max(96, Math.round(boxWidth * boxHeight * 0.015)));

    if (shouldPreferTextSelection) {
      clearLassoDraft();
      setLassoTextSelection(textObjectIds);
      return;
    }

    if (!hasAnySelection || trimMaxX < trimMinX || trimMaxY < trimMinY) {
      return;
    }

    const trimWidth = trimMaxX - trimMinX + 1;
    const trimHeight = trimMaxY - trimMinY + 1;
    const trimmedSelectionPatch = new ImageData(trimWidth, trimHeight);
    for (let y = 0; y < trimHeight; y += 1) {
      const srcStart = ((trimMinY + y) * boxWidth + trimMinX) * 4;
      const srcEnd = srcStart + trimWidth * 4;
      const dstStart = y * trimWidth * 4;
      trimmedSelectionPatch.data.set(selectedPatch.data.subarray(srcStart, srcEnd), dstStart);
    }

    ctx.putImageData(basePatch, minPixelX, minPixelY);
    markAuthoringDirty();
    captureBitmapSelectionBackdropFromCanvas();

    const selectionSourceCanvas = document.createElement("canvas");
    selectionSourceCanvas.width = trimWidth;
    selectionSourceCanvas.height = trimHeight;
    const selectionSourceCtx = selectionSourceCanvas.getContext("2d");
    if (!selectionSourceCtx) return;
    selectionSourceCtx.putImageData(trimmedSelectionPatch, 0, 0);
    flushBitmapSelectionSessionState({
      owner: "lasso",
      items: [{
        id: createBitmapSelectionSessionItemId(),
        sourceCanvas: selectionSourceCanvas,
        x: (minPixelX + trimMinX) / metrics.scaleX,
        y: (minPixelY + trimMinY) / metrics.scaleY,
        width: trimWidth / metrics.scaleX,
        height: trimHeight / metrics.scaleY,
        flipX: false,
        flipY: false,
        rotation: 0,
        allowRotation: true,
      }],
    });
  }, [captureBitmapSelectionBackdropFromCanvas, clearLassoDraft, createBitmapSelectionSessionItemId, displayedTextObjects, findTextObjectIdsInLassoPath, flushBitmapSelectionSessionState, getAuthoringMetrics, markAuthoringDirty, setLassoTextSelection]);

  const normalizeRect = useCallback(
    (startX: number, startY: number, endX: number, endY: number) => ({
      x: Math.min(startX, endX),
      y: Math.min(startY, endY),
      width: Math.abs(endX - startX),
      height: Math.abs(endY - startY),
    }),
    []
  );

  const createBoxSelectionFromDraft = useCallback((draft: SelectionBoxDraft) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const metrics = getAuthoringMetrics();
    if (!canvas || !ctx || !metrics) return false;

    const minPixelX = Math.max(0, Math.min(draft.start.pixelX, draft.end.pixelX));
    const maxPixelX = Math.min(canvas.width - 1, Math.max(draft.start.pixelX, draft.end.pixelX));
    const minPixelY = Math.max(0, Math.min(draft.start.pixelY, draft.end.pixelY));
    const maxPixelY = Math.min(canvas.height - 1, Math.max(draft.start.pixelY, draft.end.pixelY));
    const boxWidth = maxPixelX - minPixelX + 1;
    const boxHeight = maxPixelY - minPixelY + 1;

    if (boxWidth < 2 || boxHeight < 2) return false;

    const region = ctx.getImageData(minPixelX, minPixelY, boxWidth, boxHeight);
    let hasVisiblePixels = false;
    for (let i = 3; i < region.data.length; i += 4) {
      if (region.data[i] > 0) {
        hasVisiblePixels = true;
        break;
      }
    }

    if (!hasVisiblePixels) {
      const textObjectIds = findTextObjectIdsInRect(
        {
          x: minPixelX / metrics.scaleX,
          y: minPixelY / metrics.scaleY,
          width: boxWidth / metrics.scaleX,
          height: boxHeight / metrics.scaleY,
        },
        displayedTextObjects,
      );
      if (textObjectIds.length > 0) {
        setSelectTextSelection(textObjectIds);
        return true;
      }
      return false;
    }

    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = boxWidth;
    sourceCanvas.height = boxHeight;
    const sourceCtx = sourceCanvas.getContext("2d");
    if (!sourceCtx) return false;
    sourceCtx.putImageData(region, 0, 0);
    for (let i = 0; i < region.data.length; i += 4) {
      region.data[i] = 0;
      region.data[i + 1] = 0;
      region.data[i + 2] = 0;
      region.data[i + 3] = 0;
    }
    ctx.putImageData(region, minPixelX, minPixelY);
    markAuthoringDirty();
    captureBitmapSelectionBackdropFromCanvas();
    flushBitmapSelectionSessionState({
      owner: "select",
      items: [{
        id: createBitmapSelectionSessionItemId(),
        sourceCanvas,
        x: minPixelX / metrics.scaleX,
        y: minPixelY / metrics.scaleY,
        width: boxWidth / metrics.scaleX,
        height: boxHeight / metrics.scaleY,
        flipX: false,
        flipY: false,
        rotation: 0,
        allowRotation: true,
      }],
    });

    return true;
  }, [captureBitmapSelectionBackdropFromCanvas, createBitmapSelectionSessionItemId, displayedTextObjects, findTextObjectIdsInRect, flushBitmapSelectionSessionState, getAuthoringMetrics, markAuthoringDirty, setSelectTextSelection]);

  const createSymbolFromCanvasSource = useCallback(
    (sourceCanvas: HTMLCanvasElement, displaySize: { width: number; height: number }) => {
    const signature = createCanvasSignature(sourceCanvas);
    if (librarySymbolsRef.current.some((symbol) => symbol.signature === signature)) {
      window.alert("This exact symbol already exists.");
      return false;
    }

    let fallbackIndex = nextSymbolNumberRef.current;
    while (librarySymbolsRef.current.some((symbol) => symbol.name.toLowerCase() === `symbol ${fallbackIndex}`.toLowerCase())) {
      fallbackIndex += 1;
    }
    const fallbackName = `Symbol ${fallbackIndex}`;
    const rawName = window.prompt("Name this symbol", fallbackName);
    if (rawName === null) return false;
    const trimmedName = rawName.trim();
    const finalName = trimmedName || fallbackName;
    const normalizedName = finalName.toLowerCase();

    if (librarySymbolsRef.current.some((symbol) => symbol.name.toLowerCase() === normalizedName)) {
      window.alert("This symbol already exists.");
      return false;
    }

    nextSymbolNumberRef.current = fallbackIndex + 1;
    const nextSymbol: LibrarySymbol = {
      id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: finalName,
      tag: "symbol",
      previewUrl: sourceCanvas.toDataURL("image/png"),
      width: Math.max(1, Math.round(displaySize.width)),
      height: Math.max(1, Math.round(displaySize.height)),
      signature,
    };
    const nextSymbols = [...librarySymbolsRef.current, nextSymbol];
    librarySymbolsRef.current = nextSymbols;
    setLibrarySymbols(nextSymbols);
    return true;
    },
    [createCanvasSignature]
  );

  const convertSelectedTextObjectsToSymbol = useCallback((objectIds: string[]) => {
    const selectionSource = createTextSelectionCanvas(objectIds, displayedTextObjects);
    if (!selectionSource) {
      return false;
    }

    return createSymbolFromCanvasSource(selectionSource.canvas, {
      width: selectionSource.bounds.width,
      height: selectionSource.bounds.height,
    });
  }, [createSymbolFromCanvasSource, createTextSelectionCanvas, displayedTextObjects]);

  const convertBitmapSelectionSessionToSymbol = useCallback((owner: BitmapSelectionOwner) => {
    const session = getBitmapSelectionSessionForOwner(owner);
    const metrics = getAuthoringMetrics();
    const canvas = canvasRef.current;
    if (!session || !metrics || !canvas) {
      return false;
    }

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const item of session.items) {
      const bounds = getDisplayedBitmapTransformBounds(item);
      minX = Math.min(minX, bounds.x);
      minY = Math.min(minY, bounds.y);
      maxX = Math.max(maxX, bounds.x + bounds.width);
      maxY = Math.max(maxY, bounds.y + bounds.height);
    }

    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      return false;
    }

    const fullCanvas = document.createElement("canvas");
    fullCanvas.width = canvas.width;
    fullCanvas.height = canvas.height;
    const fullCtx = fullCanvas.getContext("2d");
    if (!fullCtx) {
      return false;
    }

    for (const item of session.items) {
      drawBitmapSelectionImageToAuthoringCanvas(fullCtx, item.sourceCanvas, item);
    }

    const pixelLeft = Math.max(0, Math.floor(minX * metrics.scaleX));
    const pixelTop = Math.max(0, Math.floor(minY * metrics.scaleY));
    const pixelRight = Math.min(fullCanvas.width, Math.ceil(maxX * metrics.scaleX));
    const pixelBottom = Math.min(fullCanvas.height, Math.ceil(maxY * metrics.scaleY));
    const pixelWidth = Math.max(1, pixelRight - pixelLeft);
    const pixelHeight = Math.max(1, pixelBottom - pixelTop);

    const croppedCanvas = document.createElement("canvas");
    croppedCanvas.width = pixelWidth;
    croppedCanvas.height = pixelHeight;
    const croppedCtx = croppedCanvas.getContext("2d");
    if (!croppedCtx) {
      return false;
    }

    croppedCtx.drawImage(fullCanvas, pixelLeft, pixelTop, pixelWidth, pixelHeight, 0, 0, pixelWidth, pixelHeight);
    return createSymbolFromCanvasSource(croppedCanvas, {
      width: pixelWidth / metrics.scaleX,
      height: pixelHeight / metrics.scaleY,
    });
  }, [createSymbolFromCanvasSource, drawBitmapSelectionImageToAuthoringCanvas, getAuthoringMetrics, getBitmapSelectionSessionForOwner, getDisplayedBitmapTransformBounds]);

  const convertKnifeSelectionToSymbol = useCallback(() => {
    convertBitmapSelectionSessionToSymbol("knife");
  }, [convertBitmapSelectionSessionToSymbol]);

  const duplicateBoxSelection = useCallback(() => {
    const selection = activeBoxSelectionRef.current;
    if (selection?.kind === "text") {
      duplicateSelectedTextObjects(selection.objectIds, "select");
      return;
    }
    duplicateBitmapSelectionSession("select");
  }, [duplicateBitmapSelectionSession, duplicateSelectedTextObjects]);

  const deleteBoxSelection = useCallback(() => {
    const selection = activeBoxSelectionRef.current;
    if (selection?.kind === "text") {
      const didDelete = deleteSelectedTextObjects(selection.objectIds);
      if (didDelete) {
        resetBoxSelectionState();
      }
      return;
    }

    if (!selection) return;
    if (selection.kind === "bitmap") {
      deleteBitmapSelectionSession("select");
      return;
    }
    resetBoxSelectionState();
    onAuthoringActionCommitted?.("selection");
  }, [deleteBitmapSelectionSession, deleteSelectedTextObjects, onAuthoringActionCommitted, resetBoxSelectionState]);

  const convertBoxSelectionToSymbol = useCallback(() => {
    if (activeBoxSelectionRef.current?.kind === "text") {
      convertSelectedTextObjectsToSymbol(activeBoxSelectionRef.current.objectIds);
      return;
    }

    convertBitmapSelectionSessionToSymbol("select");
  }, [convertBitmapSelectionSessionToSymbol, convertSelectedTextObjectsToSymbol]);

  const convertLassoSelectionToSymbol = useCallback(() => {
    if (activeLassoSelectionRef.current?.kind === "text") {
      convertSelectedTextObjectsToSymbol(activeLassoSelectionRef.current.objectIds);
      return;
    }

    convertBitmapSelectionSessionToSymbol("lasso");
  }, [convertBitmapSelectionSessionToSymbol, convertSelectedTextObjectsToSymbol]);

  const getDisplayedPlacedImageRect = useCallback((placedAsset: ActivePlacedImageAsset) => ({
    x: placedAsset.flipX ? placedAsset.x - placedAsset.width : placedAsset.x,
    y: placedAsset.flipY ? placedAsset.y - placedAsset.height : placedAsset.y,
    width: placedAsset.width,
    height: placedAsset.height,
  }), []);

  const getDisplayedPlacedImageBounds = useCallback((placedAsset: ActivePlacedImageAsset) => (
    getRotatedRectBounds(getDisplayedPlacedImageRect(placedAsset), placedAsset.rotation)
  ), [getDisplayedPlacedImageRect]);

  const drawPlacedImageAsset = useCallback(
    (ctx: CanvasRenderingContext2D, placedSource: DrawableImageSource, placedAsset: ActivePlacedImageAsset) => {
      const displayRect = getDisplayedPlacedImageRect(placedAsset);
      const centerX = displayRect.x + displayRect.width / 2;
      const centerY = displayRect.y + displayRect.height / 2;
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate((placedAsset.rotation * Math.PI) / 180);
      ctx.scale(placedAsset.flipX ? -1 : 1, placedAsset.flipY ? -1 : 1);
      ctx.drawImage(placedSource, -placedAsset.width / 2, -placedAsset.height / 2, placedAsset.width, placedAsset.height);
      ctx.restore();
    },
    [getDisplayedPlacedImageRect]
  );

  const captureAuthoringSnapshot = useCallback((options?: DrawingCanvasSnapshotOptions): DrawingCanvasSnapshot | null => {
    const canvas = canvasRef.current;
    const sourceCtx = canvas?.getContext("2d");
    if (!canvas || !sourceCtx || canvas.width <= 0 || canvas.height <= 0) {
      motionTweenWarn("captureAuthoringSnapshot:missing-canvas", {
        hasCanvas: Boolean(canvas),
        hasContext: Boolean(sourceCtx),
        canvasWidth: canvas?.width ?? null,
        canvasHeight: canvas?.height ?? null,
      });
      return null;
    }

    const activeBitmapSession = bitmapSelectionSessionRef.current;
    const activeBitmapSelectionNeedsComposite = Boolean(activeBitmapSession?.items.length);
    const debugBitmapSelectionItem = activeBitmapSession?.items.length === 1 ? activeBitmapSession.items[0] : null;
    const placedAsset = activePlacedImageAssetRef.current;
    const placedSource = activePlacedImageSourceRef.current;
    const requiresCompositeSnapshot =
      activeBitmapSelectionNeedsComposite ||
      Boolean(placedAsset && placedSource);

    let snapshotCtx: CanvasRenderingContext2D = sourceCtx;
    let snapshotPreviewSource: CanvasImageSource = canvas;
    let snapshotBitmap: ImageData | null = null;
    let bitmapCaptureDurationMs = 0;
    const captureMode: "full" | "dirty-patch" = "full";
    const dirtyCaptureRect: CanvasDirtyRect | null = null;
    const includePreviewUrl = options?.includePreviewUrl !== false;
    const captureVersion = authoringChangeVersionRef.current;
    const needsAuthoringMetrics = includePreviewUrl || ENABLE_MOTION_TWEEN_DEBUG;
    let resolvedMetrics: ReturnType<typeof getAuthoringMetrics> | null | undefined;
    const getSnapshotMetrics = () => {
      if (!needsAuthoringMetrics) {
        return null;
      }

      if (resolvedMetrics !== undefined) {
        return resolvedMetrics;
      }

      resolvedMetrics = getAuthoringMetrics();
      return resolvedMetrics;
    };

    if (requiresCompositeSnapshot) {
      const snapshotCanvas = document.createElement("canvas");
      snapshotCanvas.width = canvas.width;
      snapshotCanvas.height = canvas.height;
      const compositeSnapshotCtx =
        snapshotCanvas.getContext("2d", { willReadFrequently: true }) ?? snapshotCanvas.getContext("2d");
      if (!compositeSnapshotCtx) {
        motionTweenWarn("captureAuthoringSnapshot:missing-context", {
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
        });
        return null;
      }

      compositeSnapshotCtx.clearRect(0, 0, snapshotCanvas.width, snapshotCanvas.height);
      compositeSnapshotCtx.setTransform(1, 0, 0, 1, 0, 0);
      compositeSnapshotCtx.drawImage(canvas, 0, 0);

      if (activeBitmapSession?.items.length) {
        compositeSnapshotCtx.globalCompositeOperation = "source-over";
        for (const item of activeBitmapSession.items) {
          drawBitmapSelectionImageToAuthoringCanvas(compositeSnapshotCtx, item.sourceCanvas, item);
        }
      }

      if (placedAsset && placedSource) {
        compositeSnapshotCtx.globalCompositeOperation = "source-over";
        drawPlacedImageAsset(compositeSnapshotCtx, placedSource, placedAsset);
      }

      compositeSnapshotCtx.setTransform(1, 0, 0, 1, 0, 0);
      snapshotCtx = compositeSnapshotCtx;
      snapshotPreviewSource = snapshotCanvas;
    } else {
      const committedBitmap = authoringCommittedBitmapRef.current;
      const dirtyRect =
        authoringDirtyCaptureModeRef.current === "region" ? authoringDirtyRectRef.current : null;
      const canUseDirtyPatch =
        options?.preferIncrementalBitmapCapture === true &&
        !includePreviewUrl &&
        dirtyRect &&
        (!committedBitmap || (committedBitmap.width === canvas.width && committedBitmap.height === canvas.height));

      if (canUseDirtyPatch) {
        const bitmapCaptureStart = performance.now();
        const dirtyPatch = sourceCtx.getImageData(
          dirtyRect.left,
          dirtyRect.top,
          dirtyRect.width,
          dirtyRect.height,
        );
        bitmapCaptureDurationMs = performance.now() - bitmapCaptureStart;

        if (ENABLE_MOTION_TWEEN_DEBUG) {
          const metrics = getSnapshotMetrics();
          motionTweenDebug("captureAuthoringSnapshot", {
            canvasWidth: canvas.width,
            canvasHeight: canvas.height,
            hostWidth: metrics?.hostRect.width ?? null,
            hostHeight: metrics?.hostRect.height ?? null,
            cameraZoom,
            cameraPan,
            includePreviewUrl,
            captureMode: "dirty-patch",
            requiresCompositeSnapshot,
            dirtyCaptureRect: dirtyRect,
            bitmapCaptureDurationMs,
            captureVersion,
          });
        }

        const result = {
          bitmap: null,
          previewUrl: undefined,
          captureVersion,
          dirtyPatchBitmap: dirtyPatch,
          dirtyPatchRect: { ...dirtyRect },
          bitmapWidth: canvas.width,
          bitmapHeight: canvas.height,
        };
        return result;
      }
    }

    const cropLeft = 0;
    const cropTop = 0;
    const cropWidth = canvas.width;
    const cropHeight = canvas.height;
    const metrics = getSnapshotMetrics();
    if (needsAuthoringMetrics && !metrics) {
      return null;
    }
    const stageCropLeft = metrics ? Math.max(0, Math.round(metrics.stageOffsetX * metrics.scaleX)) : 0;
    const stageCropTop = metrics ? Math.max(0, Math.round(metrics.stageOffsetY * metrics.scaleY)) : 0;
    const stageCropWidth = metrics ? Math.max(1, Math.round(metrics.hostRect.width * metrics.scaleX)) : cropWidth;
    const stageCropHeight = metrics ? Math.max(1, Math.round(metrics.hostRect.height * metrics.scaleY)) : cropHeight;

    if (!snapshotBitmap) {
      const bitmapCaptureStart = performance.now();
      snapshotBitmap = snapshotCtx.getImageData(cropLeft, cropTop, cropWidth, cropHeight);
      bitmapCaptureDurationMs = performance.now() - bitmapCaptureStart;
    }
    const activeSelectionDisplayRect =
      ENABLE_MOTION_TWEEN_DEBUG && debugBitmapSelectionItem ? getDisplayedBitmapTransformBounds(debugBitmapSelectionItem) : null;
    const expectedSelectionPixelRect =
      ENABLE_MOTION_TWEEN_DEBUG && debugBitmapSelectionItem && metrics && metrics.hostRect.width > 0 && metrics.hostRect.height > 0
        ? {
            x: activeSelectionDisplayRect!.x * metrics.scaleX - cropLeft,
            y: activeSelectionDisplayRect!.y * metrics.scaleY - cropTop,
            width: activeSelectionDisplayRect!.width * metrics.scaleX,
            height: activeSelectionDisplayRect!.height * metrics.scaleY,
          }
        : null;
    const capturedBounds = ENABLE_MOTION_TWEEN_DEBUG ? findOpaqueImageDataBounds(snapshotBitmap) : null;

    let previewUrl: string | undefined;
    let previewEncodeDurationMs = 0;

    if (includePreviewUrl) {
      const previewCanvas = document.createElement("canvas");
      previewCanvas.width = stageCropWidth;
      previewCanvas.height = stageCropHeight;
      const previewCtx = previewCanvas.getContext("2d");
      if (!previewCtx) {
        return null;
      }
      previewCtx.drawImage(
        snapshotPreviewSource,
        stageCropLeft,
        stageCropTop,
        stageCropWidth,
        stageCropHeight,
        0,
        0,
        stageCropWidth,
        stageCropHeight,
      );

      const previewEncodeStart = performance.now();
      previewUrl = previewCanvas.toDataURL("image/png");
      previewEncodeDurationMs = performance.now() - previewEncodeStart;
    }

    if (ENABLE_MOTION_TWEEN_DEBUG) {
      const dpr = window.devicePixelRatio || 1;
      motionTweenDebug("captureAuthoringSnapshot", {
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        hostWidth: metrics?.hostRect.width ?? null,
        hostHeight: metrics?.hostRect.height ?? null,
        cameraZoom,
        cameraPan,
        cropLeft,
        cropTop,
        cropWidth,
        cropHeight,
        stageCropLeft,
        stageCropTop,
        stageCropWidth,
        stageCropHeight,
        devicePixelRatio: dpr,
        includePreviewUrl,
        captureMode,
        requiresCompositeSnapshot,
        activeBitmapSelectionOwner: activeBitmapSession?.owner ?? null,
        activeBitmapSelectionItems: activeBitmapSession?.items.length ?? 0,
        activePlacedImageAsset: Boolean(placedAsset),
        dirtyCaptureRect,
        capturedBounds,
        bitmapCaptureDurationMs,
        previewEncodeDurationMs,
        selectionRect: debugBitmapSelectionItem
          ? {
              x: debugBitmapSelectionItem.x,
              y: debugBitmapSelectionItem.y,
              width: debugBitmapSelectionItem.width,
              height: debugBitmapSelectionItem.height,
              flipX: debugBitmapSelectionItem.flipX,
              flipY: debugBitmapSelectionItem.flipY,
            }
          : null,
        expectedSelectionPixelRect,
      });
    }

    if (debugBitmapSelectionItem && expectedSelectionPixelRect && capturedBounds) {
      const deltaX = Math.abs(capturedBounds.left - expectedSelectionPixelRect.x);
      const deltaY = Math.abs(capturedBounds.top - expectedSelectionPixelRect.y);
      const deltaWidth = Math.abs(capturedBounds.width - expectedSelectionPixelRect.width);
      const deltaHeight = Math.abs(capturedBounds.height - expectedSelectionPixelRect.height);
      const selectionCaptureMismatch = deltaX > 3 || deltaY > 3 || deltaWidth > 3 || deltaHeight > 3;

      if (selectionCaptureMismatch) {
        motionTweenWarn("captureAuthoringSnapshot:selection-mismatch", {
          selectionRect: debugBitmapSelectionItem,
          expectedSelectionPixelRect,
          capturedBounds,
          deltaX,
          deltaY,
          deltaWidth,
          deltaHeight,
        });
      }
    }

    const result = {
      bitmap: snapshotBitmap,
      previewUrl,
      captureVersion,
    };
    return result;
  }, [cameraPan, cameraZoom, drawBitmapSelectionImageToAuthoringCanvas, drawPlacedImageAsset, getAuthoringMetrics, getDisplayedBitmapTransformBounds]);

  useImperativeHandle(
    ref,
    () => ({
      captureAuthoringSnapshot,
      clearTransientEditingState,
      getPlaybackSurfaceLayout,
      hasActiveBitmapSelectionSession: () => Boolean(bitmapSelectionSessionRef.current?.items.length),
      hasPendingAuthoringChanges,
      markAuthoringChangesCommitted,
      setOnionOverlayContent,
      shouldDeferAuthoringSnapshotCapture,
    }),
    [
      captureAuthoringSnapshot,
      clearTransientEditingState,
      getPlaybackSurfaceLayout,
      hasPendingAuthoringChanges,
      markAuthoringChangesCommitted,
      setOnionOverlayContent,
      shouldDeferAuthoringSnapshotCapture,
    ]
  );

  const commitPlacedImageAssetToCanvas = useCallback(() => {
    const placedAsset = activePlacedImageAssetRef.current;
    const placedSource = activePlacedImageSourceRef.current;
    const ctx = canvasRef.current?.getContext("2d");
    if (!placedAsset || !placedSource || !ctx) return;

    drawPlacedImageAsset(ctx, placedSource, placedAsset);
    markAuthoringDirty();
    placedImageInteractionRef.current = null;
    activePlacedImageSourceRef.current = null;
    setActivePlacedImageAsset(null);
    onAuthoringActionCommitted?.("placed-asset");
  }, [drawPlacedImageAsset, markAuthoringDirty, onAuthoringActionCommitted]);

  useEffect(() => {
    if (activeTool === "Lasso") return;
    if (activeLassoSelectionRef.current?.kind === "bitmap") {
      const didCommit = commitLassoSelectionToCanvas();
      if (!didCommit) {
        return;
      }
    } else {
      setActiveLassoSelectionState(null);
      selectionSourceCanvasRef.current = null;
    }
    clearLassoDraft();
  }, [activeTool, clearLassoDraft, commitLassoSelectionToCanvas, setActiveLassoSelectionState]);

  useEffect(() => {
    if (activeTool === "Knife") return;

    if (knifePiecesRef.current.length === 0) {
      clearKnifeDraft();
      return;
    }

    deselectKnifePieces();
  }, [activeTool, clearKnifeDraft, deselectKnifePieces]);

  useEffect(() => {
    if (!isTimelinePlaying) {
      playbackOverlayDebugLoggedRef.current = false;
      return;
    }

    clearTransientEditingState();
  }, [clearTransientEditingState, isTimelinePlaying]);

  useEffect(() => {
    if (previousEditingContextKeyRef.current === editingContextKey) {
      return;
    }

    previousEditingContextKeyRef.current = editingContextKey;

    if (isTimelinePlaying) {
      if (
        !playbackOverlayDebugLoggedRef.current &&
        (activeLassoSelection || activeKnifePieces.length > 0 || activePlacedImageAsset || selectionBoxDraft || activeBoxSelection)
      ) {
        playbackOverlayDebugLoggedRef.current = true;
        motionTweenWarn("overlaySuppressedWhilePlaying", {
          activeLassoSelection: Boolean(activeLassoSelection),
          activeKnifePieces: activeKnifePieces.length,
          activePlacedImageAsset: Boolean(activePlacedImageAsset),
          selectionBoxDraft: Boolean(selectionBoxDraft),
          activeBoxSelection: Boolean(activeBoxSelection),
        });
      }
      return;
    }

    clearTransientEditingState();
  }, [
    activeBoxSelection,
    activeKnifePieces.length,
    activeLassoSelection,
    activePlacedImageAsset,
    clearTransientEditingState,
    editingContextKey,
    isTimelinePlaying,
    selectionBoxDraft,
  ]);

  const drawTintedOnionMask = useCallback(
    (
      overlayCtx: CanvasRenderingContext2D,
      width: number,
      height: number,
      fillStyle: string,
      drawMask: (workCtx: CanvasRenderingContext2D) => void,
    ) => {
      if (width <= 0 || height <= 0) {
        return;
      }

      let workCanvas = onionBitmapWorkCanvasRef.current;
      if (!workCanvas) {
        workCanvas = document.createElement("canvas");
        onionBitmapWorkCanvasRef.current = workCanvas;
      }

      if (workCanvas.width !== width || workCanvas.height !== height) {
        workCanvas.width = width;
        workCanvas.height = height;
      }

      const workCtx =
        workCanvas.getContext("2d", { willReadFrequently: true }) ??
        workCanvas.getContext("2d");
      if (!workCtx) {
        return;
      }

      workCtx.setTransform(1, 0, 0, 1, 0, 0);
      workCtx.clearRect(0, 0, workCanvas.width, workCanvas.height);
      workCtx.globalCompositeOperation = "source-over";
      try {
        drawMask(workCtx);
        workCtx.setTransform(1, 0, 0, 1, 0, 0);
        workCtx.globalCompositeOperation = "source-in";
        workCtx.fillStyle = fillStyle;
        workCtx.fillRect(0, 0, workCanvas.width, workCanvas.height);
        workCtx.globalCompositeOperation = "source-over";

        overlayCtx.save();
        overlayCtx.setTransform(1, 0, 0, 1, 0, 0);
        overlayCtx.globalCompositeOperation = "source-over";
        overlayCtx.drawImage(workCanvas, 0, 0, workCanvas.width, workCanvas.height);
        overlayCtx.restore();
      } catch {
        return;
      }
    },
    [],
  );

  const drawTintedOnionBitmap = useCallback(
    (
      overlayCtx: CanvasRenderingContext2D,
      bitmap: ImageData | null,
      tintKind: OnionTintKind,
    ) => {
      if (!bitmap) {
        return;
      }

      const bitmapWidth = Number.isInteger(bitmap.width) ? bitmap.width : 0;
      const bitmapHeight = Number.isInteger(bitmap.height) ? bitmap.height : 0;
      const expectedDataLength = bitmapWidth * bitmapHeight * 4;
      if (
        bitmapWidth <= 0 ||
        bitmapHeight <= 0 ||
        !Number.isSafeInteger(expectedDataLength) ||
        expectedDataLength <= 0 ||
        bitmap.data.length < expectedDataLength
      ) {
        return;
      }

      drawTintedOnionMask(
        overlayCtx,
        bitmapWidth,
        bitmapHeight,
        ONION_TINT_STYLES[tintKind].fillStyle,
        (workCtx) => {
          workCtx.putImageData(bitmap, 0, 0);
        },
      );
    },
    [drawTintedOnionMask],
  );

  const drawTintedOnionTextObjects = useCallback(
    (
      overlayCtx: CanvasRenderingContext2D,
      textObjects: DrawingTextObject[],
      tintKind: OnionTintKind,
      metrics: NonNullable<ReturnType<typeof getAuthoringMetrics>>,
      canvasWidth: number,
      canvasHeight: number,
    ) => {
      if (textObjects.length === 0) {
        return;
      }

      drawTintedOnionMask(
        overlayCtx,
        canvasWidth,
        canvasHeight,
        ONION_TINT_STYLES[tintKind].fillStyle,
        (workCtx) => {
          workCtx.setTransform(metrics.scaleX, 0, 0, metrics.scaleY, 0, 0);
          for (const textObject of textObjects) {
            drawDrawingTextObject(workCtx, textObject, {
              colorOverride: ONION_TEXT_MASK_COLOR,
              opacity: 1,
            });
          }
        },
      );
    },
    [drawTintedOnionMask],
  );

  useEffect(() => {
    const onionCanvas = onionCanvasRef.current;
    const baseCanvas = canvasRef.current;
    if (!onionCanvas || !baseCanvas) return;

    if (onionCanvas.width !== baseCanvas.width || onionCanvas.height !== baseCanvas.height) {
      onionCanvas.width = baseCanvas.width;
      onionCanvas.height = baseCanvas.height;
    }

    const onionCtx = onionCanvas.getContext("2d");
    if (!onionCtx) return;

    onionCtx.setTransform(1, 0, 0, 1, 0, 0);
    onionCtx.clearRect(0, 0, onionCanvas.width, onionCanvas.height);

    if (isTimelinePlaying) {
      return;
    }

    const {
      previousBitmap: previousFrameBitmap,
      nextBitmap: nextFrameBitmap,
      previousTextObjects,
      nextTextObjects,
    } = onionOverlayContentRef.current;

    drawTintedOnionBitmap(onionCtx, previousFrameBitmap, "previous");
    drawTintedOnionBitmap(onionCtx, nextFrameBitmap, "next");

    if (previousTextObjects.length === 0 && nextTextObjects.length === 0) {
      return;
    }

    const metrics = getAuthoringMetrics();
    if (!metrics) {
      return;
    }

    drawTintedOnionTextObjects(
      onionCtx,
      previousTextObjects,
      "previous",
      metrics,
      onionCanvas.width,
      onionCanvas.height,
    );
    drawTintedOnionTextObjects(
      onionCtx,
      nextTextObjects,
      "next",
      metrics,
      onionCanvas.width,
      onionCanvas.height,
    );
  }, [
    drawTintedOnionBitmap,
    drawTintedOnionTextObjects,
    getAuthoringMetrics,
    isTimelinePlaying,
    onionOverlayVersion,
  ]);

  useEffect(() => {
    const textCanvas = textCanvasRef.current;
    const baseCanvas = canvasRef.current;
    if (!textCanvas || !baseCanvas) return;

    if (textCanvas.width !== baseCanvas.width || textCanvas.height !== baseCanvas.height) {
      textCanvas.width = baseCanvas.width;
      textCanvas.height = baseCanvas.height;
    }

    const textCtx = textCanvas.getContext("2d");
    if (!textCtx) return;

    textCtx.setTransform(1, 0, 0, 1, 0, 0);
    textCtx.clearRect(0, 0, textCanvas.width, textCanvas.height);

    if (isTimelinePlaying || displayedTextObjects.length === 0) {
      return;
    }

    const metrics = getAuthoringMetrics();
    if (!metrics) {
      return;
    }

    textCtx.setTransform(metrics.scaleX, 0, 0, metrics.scaleY, 0, 0);
    for (const activeTextObject of displayedTextObjects) {
      drawDrawingTextObject(textCtx, activeTextObject);
    }
  }, [displayedTextObjects, getAuthoringMetrics, isTimelinePlaying]);

  useEffect(() => {
    const overlayCanvas = lassoOverlayRef.current;
    const baseCanvas = canvasRef.current;
    if (!overlayCanvas || !baseCanvas) return;

    if (overlayCanvas.width !== baseCanvas.width || overlayCanvas.height !== baseCanvas.height) {
      overlayCanvas.width = baseCanvas.width;
      overlayCanvas.height = baseCanvas.height;
    }

    const overlayCtx = overlayCanvas.getContext("2d");
    if (!overlayCtx) return;

    overlayCtx.setTransform(1, 0, 0, 1, 0, 0);
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    if (isTimelinePlaying) {
      return;
    }

    const needsOverlayMetrics =
      lassoPath.length > 1 ||
      displayedTextObjects.length > 0 ||
      Boolean(activeLassoSelection) ||
      Boolean(activeBitmapSelectionSession?.items.length) ||
      displayedKnifePath.length > 1 ||
      Boolean(activePlacedImageAsset) ||
      Boolean(selectionBoxDraft) ||
      Boolean(activeBoxSelection) ||
      (activeTool === "Text" && Boolean(selectedTextObjectId));
    if (!needsOverlayMetrics) {
      return;
    }

    const metrics = getAuthoringMetrics();
    if (!metrics) {
      return;
    }
    const scaleX = metrics.scaleX;
    const scaleY = metrics.scaleY;

    overlayCtx.setTransform(scaleX, 0, 0, scaleY, 0, 0);

    const drawSelectionHandles = (displayRect: RectBounds) => {
      const handleBounds = buildResizeHandleBounds(displayRect, LASSO_RESIZE_HANDLE_SIZE);

      for (const handle of RESIZE_HANDLE_ORDER) {
        const bounds = handleBounds[handle];
        overlayCtx.fillStyle = "rgba(18,22,28,0.96)";
        overlayCtx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
        overlayCtx.strokeStyle = "rgba(95, 170, 255, 0.96)";
        overlayCtx.lineWidth = 1.1;
        overlayCtx.strokeRect(bounds.x + 0.5, bounds.y + 0.5, bounds.width - 1, bounds.height - 1);
      }
    };

    const drawRotationHandle = (displayRect: RectBounds) => {
      const handle = buildRotateHandleBounds(displayRect, LASSO_RESIZE_HANDLE_SIZE);
      overlayCtx.save();
      overlayCtx.strokeStyle = "rgba(95, 170, 255, 0.92)";
      overlayCtx.lineWidth = 1.1;
      overlayCtx.setLineDash([]);
      overlayCtx.beginPath();
      overlayCtx.moveTo(handle.connectorX, handle.connectorY);
      overlayCtx.lineTo(handle.centerX, handle.centerY);
      overlayCtx.stroke();
      overlayCtx.fillStyle = "rgba(18,22,28,0.98)";
      overlayCtx.beginPath();
      overlayCtx.arc(handle.centerX, handle.centerY, handle.width / 2, 0, Math.PI * 2);
      overlayCtx.fill();
      overlayCtx.strokeStyle = "rgba(95, 170, 255, 0.98)";
      overlayCtx.beginPath();
      overlayCtx.arc(handle.centerX, handle.centerY, handle.width / 2 - 0.55, 0, Math.PI * 2);
      overlayCtx.stroke();
      overlayCtx.restore();
    };

    const textToolSelectionRect =
      activeTool === "Text" && selectedTextObjectId
        ? measureTextSelectionBounds(displayedTextObjects, [selectedTextObjectId])
        : null;
    if (textToolSelectionRect) {
      overlayCtx.strokeStyle = "rgba(95, 170, 255, 0.96)";
      overlayCtx.lineWidth = 1;
      overlayCtx.setLineDash([6, 4]);
      overlayCtx.strokeRect(
        textToolSelectionRect.x,
        textToolSelectionRect.y,
        textToolSelectionRect.width,
        textToolSelectionRect.height,
      );
      overlayCtx.setLineDash([]);
      drawSelectionHandles(textToolSelectionRect);
      drawRotationHandle(textToolSelectionRect);
    }

    if (activeLassoSelection?.kind === "text") {
      const displayRect = getDisplayedLassoSelectionRect(activeLassoSelection);
      if (displayRect) {
        overlayCtx.strokeStyle = "rgba(95, 170, 255, 0.95)";
        overlayCtx.lineWidth = 1;
        overlayCtx.setLineDash([6, 4]);
        overlayCtx.strokeRect(displayRect.x, displayRect.y, displayRect.width, displayRect.height);
        overlayCtx.setLineDash([]);
        drawSelectionHandles(displayRect);
        drawRotationHandle(displayRect);
      }
    }

    if (lassoPath.length > 1) {
      overlayCtx.strokeStyle = "rgba(95, 170, 255, 0.96)";
      overlayCtx.lineWidth = 1.3;
      overlayCtx.setLineDash([6, 4]);
      overlayCtx.beginPath();
      overlayCtx.moveTo(lassoPath[0].x, lassoPath[0].y);
      for (let i = 1; i < lassoPath.length; i += 1) {
        overlayCtx.lineTo(lassoPath[i].x, lassoPath[i].y);
      }
      overlayCtx.stroke();
      overlayCtx.setLineDash([]);
    }

    if (activeBitmapSelectionSession?.items.length) {
      overlayCtx.globalCompositeOperation = "source-over";
      for (const item of activeBitmapSelectionSession.items) {
        drawBitmapSelectionImage(overlayCtx, item.sourceCanvas, item);
      }

      if (activeBitmapSelectionSession.owner === "knife") {
        for (const item of activeBitmapSelectionSession.items) {
          const displayRect = getDisplayedBitmapTransformBounds(item);
          const isActiveKnifePiece = activeKnifePieceId ? item.id === activeKnifePieceId : true;
          overlayCtx.strokeStyle = "rgba(95, 170, 255, 0.95)";
          overlayCtx.lineWidth = 1;
          overlayCtx.setLineDash([6, 4]);
          overlayCtx.strokeRect(displayRect.x, displayRect.y, displayRect.width, displayRect.height);
          overlayCtx.setLineDash([]);
          if (isActiveKnifePiece) {
            drawSelectionHandles(displayRect);
          }
          if (isActiveKnifePiece && item.allowRotation) {
            drawRotationHandle(displayRect);
          }
        }
      } else {
        const item = activeBitmapSelectionSession.items[0] ?? null;
        if (item) {
          const displayRect = getDisplayedBitmapTransformBounds(item);
          overlayCtx.strokeStyle =
            activeBitmapSelectionSession.owner === "select"
              ? "rgba(72, 79, 91, 0.96)"
              : "rgba(95, 170, 255, 0.95)";
          overlayCtx.lineWidth = 1;
          overlayCtx.setLineDash(activeBitmapSelectionSession.owner === "lasso" ? [6, 4] : []);
          overlayCtx.strokeRect(displayRect.x, displayRect.y, displayRect.width, displayRect.height);
          overlayCtx.setLineDash([]);
          drawSelectionHandles(displayRect);
          if (item.allowRotation) {
            drawRotationHandle(displayRect);
          }
        }
      }
    }

    if (displayedKnifePath.length > 1) {
      overlayCtx.strokeStyle = "rgba(95, 170, 255, 0.96)";
      overlayCtx.lineWidth = 1.3;
      overlayCtx.setLineDash([6, 4]);
      overlayCtx.beginPath();
      overlayCtx.moveTo(displayedKnifePath[0].x, displayedKnifePath[0].y);
      for (let i = 1; i < displayedKnifePath.length; i += 1) {
        overlayCtx.lineTo(displayedKnifePath[i].x, displayedKnifePath[i].y);
      }
      overlayCtx.stroke();
      overlayCtx.setLineDash([]);
    }

    if (activePlacedImageAsset && activePlacedImageSourceRef.current) {
      const placedAsset = activePlacedImageAsset;
      const displayRect = getDisplayedPlacedImageBounds(placedAsset);
      overlayCtx.globalCompositeOperation = "source-over";
      drawPlacedImageAsset(overlayCtx, activePlacedImageSourceRef.current, placedAsset);

      overlayCtx.strokeStyle = "rgba(95, 170, 255, 0.95)";
      overlayCtx.lineWidth = 1;
      overlayCtx.setLineDash([6, 4]);
      overlayCtx.strokeRect(displayRect.x, displayRect.y, displayRect.width, displayRect.height);
      overlayCtx.setLineDash([]);
      drawSelectionHandles(displayRect);
      drawRotationHandle(displayRect);
    }

    if (selectionBoxDraft) {
      const draftRect = normalizeRect(
        selectionBoxDraft.start.x,
        selectionBoxDraft.start.y,
        selectionBoxDraft.end.x,
        selectionBoxDraft.end.y
      );
      overlayCtx.strokeStyle = "rgba(72, 79, 91, 0.92)";
      overlayCtx.lineWidth = 1;
      overlayCtx.setLineDash([]);
      overlayCtx.strokeRect(draftRect.x, draftRect.y, draftRect.width, draftRect.height);
    } else if (activeBoxSelection?.kind === "text") {
      const displayRect = getDisplayedBoxSelectionRect(activeBoxSelection);
      if (!displayRect) {
        return;
      }
      overlayCtx.strokeStyle = "rgba(72, 79, 91, 0.96)";
      overlayCtx.lineWidth = 1;
      overlayCtx.setLineDash([]);
      overlayCtx.strokeRect(displayRect.x, displayRect.y, displayRect.width, displayRect.height);
      drawSelectionHandles(displayRect);
      drawRotationHandle(displayRect);
    }

  }, [
    activeTool,
    activeKnifePieceId,
    lassoPath,
    displayedKnifePath,
    activeLassoSelection,
    activeBitmapSelectionSession,
    displayedTextObjects,
    measureTextSelectionBounds,
    selectedTextObjectId,
    activePlacedImageAsset,
    selectionBoxDraft,
    activeBoxSelection,
    LASSO_RESIZE_HANDLE_SIZE,
    drawBitmapSelectionImage,
    drawPlacedImageAsset,
    getAuthoringMetrics,
    getDisplayedBitmapTransformBounds,
    getDisplayedBoxSelectionRect,
    getDisplayedLassoSelectionRect,
    getDisplayedPlacedImageBounds,
    isTimelinePlaying,
    normalizeRect,
  ]);

  const fillConnectedRegion = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const point = getCanvasPoint(e);
    if (!point) return;
    const x = point.pixelX;
    const y = point.pixelY;
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { data, width, height } = imageData;
    const startIndex = (y * width + x) * 4;
    const targetR = data[startIndex];
    const targetG = data[startIndex + 1];
    const targetB = data[startIndex + 2];
    const targetA = data[startIndex + 3];
    const fill = parseHexColor(fillColor);
    const tolerance = fillTolerance / 100;
    const COLOR_TOLERANCE = Math.round(tolerance * 96);
    const ALPHA_TOLERANCE = Math.round(tolerance * 96);
    const TRANSPARENT_TARGET_ALPHA = 32;
    const VERY_LOW_ALPHA = 8;
    const NOT_FULLY_OPAQUE = 250;
    const FILL_EDGE_TOLERANCE = 28;

    const isWithinTolerance = (value: number, target: number, tolerance: number) =>
      Math.abs(value - target) <= tolerance;

    if (
      isWithinTolerance(targetR, fill.r, COLOR_TOLERANCE) &&
      isWithinTolerance(targetG, fill.g, COLOR_TOLERANCE) &&
      isWithinTolerance(targetB, fill.b, COLOR_TOLERANCE) &&
      isWithinTolerance(targetA, fill.a, ALPHA_TOLERANCE)
    ) {
      return;
    }

    const isTargetMostlyTransparent = targetA <= TRANSPARENT_TARGET_ALPHA;

    const matchesTargetColor = (idx: number) => {
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      const closeToTarget =
        isWithinTolerance(r, targetR, COLOR_TOLERANCE) &&
        isWithinTolerance(g, targetG, COLOR_TOLERANCE) &&
        isWithinTolerance(b, targetB, COLOR_TOLERANCE) &&
        isWithinTolerance(a, targetA, ALPHA_TOLERANCE);

      if (!isTargetMostlyTransparent) return closeToTarget;

      const closeToFillColor =
        isWithinTolerance(r, fill.r, FILL_EDGE_TOLERANCE) &&
        isWithinTolerance(g, fill.g, FILL_EDGE_TOLERANCE) &&
        isWithinTolerance(b, fill.b, FILL_EDGE_TOLERANCE);

      // When refilling erased patches, include semi-transparent edge pixels
      // that are not fully opaque and are visually part of the erased region.
      return closeToTarget || (a <= NOT_FULLY_OPAQUE && (a <= VERY_LOW_ALPHA || closeToFillColor));
    };

    const totalPixels = width * height;
    const stack: number[] = [y * width + x];
    const queued = new Uint8Array(totalPixels);
    queued[y * width + x] = 1;
    while (stack.length) {
      const currentPixel = stack.pop();
      if (currentPixel === undefined) continue;
      const currentX = currentPixel % width;
      const currentY = Math.floor(currentPixel / width);
      if (currentX < 0 || currentY < 0 || currentX >= width || currentY >= height) continue;

      const idx = (currentY * width + currentX) * 4;
      if (!matchesTargetColor(idx)) continue;

      data[idx] = fill.r;
      data[idx + 1] = fill.g;
      data[idx + 2] = fill.b;
      data[idx + 3] = fill.a;

      const queueNeighbor = (nextX: number, nextY: number) => {
        if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) {
          return;
        }
        const nextPixel = nextY * width + nextX;
        if (queued[nextPixel]) {
          return;
        }
        queued[nextPixel] = 1;
        stack.push(nextPixel);
      };

      queueNeighbor(currentX + 1, currentY);
      queueNeighbor(currentX - 1, currentY);
      queueNeighbor(currentX, currentY + 1);
      queueNeighbor(currentX, currentY - 1);
    }

    ctx.putImageData(imageData, 0, 0);
    markAuthoringDirty();
  };

  const startCanvasStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePlacedImageAssetRef.current) {
      const point = getCanvasPoint(e);
      const placedAsset = activePlacedImageAssetRef.current;
      if (!point || !placedAsset) return;
      const displayRect = getDisplayedPlacedImageBounds(placedAsset);
      const rotateHandle = resolveRotateHandleAtPoint(displayRect, point, LASSO_RESIZE_HANDLE_SIZE);
      const resizeHandle = resolveResizeHandleAtPoint(displayRect, point, LASSO_RESIZE_HANDLE_SIZE);

      const isInsideAsset =
        point.x >= displayRect.x &&
        point.x <= displayRect.x + displayRect.width &&
        point.y >= displayRect.y &&
        point.y <= displayRect.y + displayRect.height;

      if (rotateHandle) {
        const baseRect = getDisplayedPlacedImageRect(placedAsset);
        placedImageInteractionRef.current = {
          mode: "rotating",
          startAngle: Math.atan2(point.y - (baseRect.y + baseRect.height / 2), point.x - (baseRect.x + baseRect.width / 2)),
          startRotation: placedAsset.rotation,
          centerX: baseRect.x + baseRect.width / 2,
          centerY: baseRect.y + baseRect.height / 2,
          snapTargetRotation: null,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }

      if (resizeHandle) {
        placedImageInteractionRef.current = {
          mode: "resizing",
          handle: resizeHandle,
          startPointerX: point.x,
          startPointerY: point.y,
          intentStartPointerX: point.x,
          intentStartPointerY: point.y,
          lastPointerX: point.x,
          lastPointerY: point.y,
          startWidth: placedAsset.width,
          startHeight: placedAsset.height,
          startFlipX: placedAsset.flipX,
          startFlipY: placedAsset.flipY,
          startX: placedAsset.x,
          startY: placedAsset.y,
          intentDirectionX: 0,
          intentDirectionY: 0,
          intentFamily: null,
          pendingIntentLock: null,
          pendingIntentFamily: null,
          pendingIntentTravelPx: 0,
          pendingIntentStableSteps: 0,
          intentLock: null,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }

      if (isInsideAsset) {
        placedImageInteractionRef.current = {
          mode: "moving",
          startPointerX: point.x,
          startPointerY: point.y,
          startX: placedAsset.x,
          startY: placedAsset.y,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }

      if (!isInsideAsset) {
        commitPlacedImageAssetToCanvas();
        return;
      }
    }

    if (activeTool === "Text") {
      const point = getCanvasPoint(e);
      if (!point) return;

      if (selectedTextObjectIdRef.current) {
        const selectedRect = measureTextSelectionBounds(displayedTextObjects, [selectedTextObjectIdRef.current]);
        const rotateHandle = selectedRect
          ? resolveRotateHandleAtPoint(selectedRect, point, LASSO_RESIZE_HANDLE_SIZE)
          : null;
        if (
          rotateHandle &&
          canEditTextInCurrentFrame &&
          beginTextInteraction([selectedTextObjectIdRef.current], point, "rotating")
        ) {
          e.currentTarget.setPointerCapture(e.pointerId);
          return;
        }
      }

      const hitTarget = findTopmostTextObjectAtPoint(point, displayedTextObjects);
      if (hitTarget) {
        setSelectedTextObjectId(hitTarget.textObject.id);
        setRightPanelTab("Properties");

        if (
          canEditTextInCurrentFrame &&
          beginTextInteraction(
            [hitTarget.textObject.id],
            point,
            hitTarget.resizeHandle ? "resizing" : "moving",
            hitTarget.resizeHandle,
          )
        ) {
          e.currentTarget.setPointerCapture(e.pointerId);
        }
        return;
      }

      createTextObjectAtPoint(point);
      return;
    }

    if (activeTool === "Select" && !canvasMovementEnabled) {
      const point = getCanvasPoint(e);
      if (!point) return;

      if (activeBoxSelectionRef.current) {
        const selection = activeBoxSelectionRef.current;
        const displayRect = getDisplayedBoxSelectionRect(selection);
        if (selection.kind === "text" && displayRect) {
          const rotateHandle = resolveRotateHandleAtPoint(displayRect, point, LASSO_RESIZE_HANDLE_SIZE);
          const resizeHandle = resolveResizeHandleAtPoint(displayRect, point, LASSO_RESIZE_HANDLE_SIZE);
          const isInsideSelection =
            point.x >= displayRect.x &&
            point.x <= displayRect.x + displayRect.width &&
            point.y >= displayRect.y &&
            point.y <= displayRect.y + displayRect.height;

          if (
            (rotateHandle || resizeHandle || isInsideSelection) &&
            canEditTextInCurrentFrame &&
            beginTextInteraction(
              selection.objectIds,
              point,
              rotateHandle ? "rotating" : resizeHandle ? "resizing" : "moving",
              resizeHandle,
            )
          ) {
            e.currentTarget.setPointerCapture(e.pointerId);
            return;
          }
        } else if (selection.kind === "bitmap" && displayRect) {
          const rotateHandle = resolveRotateHandleAtPoint(displayRect, point, LASSO_RESIZE_HANDLE_SIZE);
          const resizeHandle = resolveResizeHandleAtPoint(displayRect, point, LASSO_RESIZE_HANDLE_SIZE);
          const isInsideSelection =
            point.x >= displayRect.x &&
            point.x <= displayRect.x + displayRect.width &&
            point.y >= displayRect.y &&
            point.y <= displayRect.y + displayRect.height;

          const currentSession = bitmapSelectionSessionRef.current;
          const currentItem = currentSession?.owner === "select" ? currentSession.items[0] ?? null : null;
          if ((rotateHandle || resizeHandle || isInsideSelection) && currentItem) {
            restoreBitmapSelectionBackdropToCanvas();
            const baseRect = getDisplayedBitmapTransformRect(selection);
            const nextInteraction: NonNullable<BitmapSelectionInteractionState> = {
              owner: "select",
              itemId: currentItem.id,
              ...(rotateHandle
                ? {
                    mode: "rotating" as const,
                    startAngle: Math.atan2(
                      point.y - (baseRect.y + baseRect.height / 2),
                      point.x - (baseRect.x + baseRect.width / 2),
                    ),
                      startRotation: selection.rotation,
                      centerX: baseRect.x + baseRect.width / 2,
                      centerY: baseRect.y + baseRect.height / 2,
                      snapTargetRotation: null,
                      didTransform: false,
                  }
                : resizeHandle
                  ? {
                    mode: "resizing" as const,
                    handle: resolveBitmapResizeHandleForRotation(baseRect, selection.rotation, resizeHandle),
                    startPointerX: point.x,
                    startPointerY: point.y,
                    intentStartPointerX: point.x,
                    intentStartPointerY: point.y,
                    lastPointerX: point.x,
                    lastPointerY: point.y,
                    startRotation: selection.rotation,
                    startWidth: selection.width,
                      startHeight: selection.height,
                      startFlipX: selection.flipX,
                      startFlipY: selection.flipY,
                      startX: selection.x,
                      startY: selection.y,
                      intentFamily: null,
                      intentLock: null,
                      didTransform: false,
                    }
                  : {
                      mode: "moving" as const,
                    startPointerX: point.x,
                    startPointerY: point.y,
                    startX: selection.x,
                    startY: selection.y,
                    didTransform: false,
                  }),
            };

            bitmapSelectionInteractionRef.current = nextInteraction;
            e.currentTarget.setPointerCapture(e.pointerId);
            return;
          }

          if (isInsideSelection) {
            return;
          }
        }
      }

      const hitTarget = findTopmostTextObjectAtPoint(point, displayedTextObjects);
      if (hitTarget) {
        setSelectTextSelection([hitTarget.textObject.id]);
        if (
          canEditTextInCurrentFrame &&
          beginTextInteraction(
            [hitTarget.textObject.id],
            point,
            hitTarget.resizeHandle ? "resizing" : "moving",
            hitTarget.resizeHandle,
          )
        ) {
          e.currentTarget.setPointerCapture(e.pointerId);
        }
        return;
      }

      if (activeBoxSelectionRef.current?.kind === "text" || selectedTextObjectIdRef.current) {
        clearTextSelectionState();
      } else {
        const didDeselect = deselectBoxSelection();
        if (!didDeselect) {
          return;
        }
      }
      setSelectionBoxDraft({ start: point, end: point });
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    if (activeTool === "Lasso") {
      const point = getCanvasPoint(e);
      if (!point) return;

      const selection = activeLassoSelectionRef.current;
      if (selection) {
        const displayRect = getDisplayedLassoSelectionRect(selection);
        if (!displayRect) {
          clearLassoDraft();
          return;
        }
        const rotateHandle = resolveRotateHandleAtPoint(displayRect, point, LASSO_RESIZE_HANDLE_SIZE);
        const resizeHandle = resolveResizeHandleAtPoint(displayRect, point, LASSO_RESIZE_HANDLE_SIZE);

        const isInsideSelection =
          point.x >= displayRect.x &&
          point.x <= displayRect.x + displayRect.width &&
          point.y >= displayRect.y &&
          point.y <= displayRect.y + displayRect.height;

        if (selection.kind === "text" && (rotateHandle || resizeHandle || isInsideSelection)) {
          if (
            canEditTextInCurrentFrame &&
            beginTextInteraction(
              selection.objectIds,
              point,
              rotateHandle ? "rotating" : resizeHandle ? "resizing" : "moving",
              resizeHandle,
            )
          ) {
            e.currentTarget.setPointerCapture(e.pointerId);
          }
          return;
        }

        if (selection.kind === "text") {
          clearTextSelectionState();
          clearLassoDraft();
          lassoInteractionRef.current = { mode: "drawing" };
          setLassoPathState([point]);
          e.currentTarget.setPointerCapture(e.pointerId);
          return;
        }

        const currentSession = bitmapSelectionSessionRef.current;
        const currentItem = currentSession?.owner === "lasso" ? currentSession.items[0] ?? null : null;

        if (selection.kind === "bitmap" && resizeHandle && currentItem) {
          const baseRect = getDisplayedBitmapTransformRect(selection);
          restoreBitmapSelectionBackdropToCanvas();
          bitmapSelectionInteractionRef.current = {
            owner: "lasso",
            itemId: currentItem.id,
            mode: "resizing",
            handle: resolveBitmapResizeHandleForRotation(baseRect, selection.rotation, resizeHandle),
            startPointerX: point.x,
            startPointerY: point.y,
            intentStartPointerX: point.x,
            intentStartPointerY: point.y,
            lastPointerX: point.x,
            lastPointerY: point.y,
            startRotation: selection.rotation,
            startWidth: selection.width,
            startHeight: selection.height,
            startFlipX: selection.flipX,
            startFlipY: selection.flipY,
            startX: selection.x,
            startY: selection.y,
            intentFamily: null,
            intentLock: null,
            didTransform: false,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
          return;
        }

        if (selection.kind === "bitmap" && rotateHandle && currentItem) {
          const baseRect = getDisplayedBitmapTransformRect(selection);
          restoreBitmapSelectionBackdropToCanvas();
          bitmapSelectionInteractionRef.current = {
            owner: "lasso",
            itemId: currentItem.id,
            mode: "rotating",
            startAngle: Math.atan2(point.y - (baseRect.y + baseRect.height / 2), point.x - (baseRect.x + baseRect.width / 2)),
            startRotation: selection.rotation,
            centerX: baseRect.x + baseRect.width / 2,
            centerY: baseRect.y + baseRect.height / 2,
            snapTargetRotation: null,
            didTransform: false,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
          return;
        }

        if (selection.kind === "bitmap" && isInsideSelection && currentItem) {
          restoreBitmapSelectionBackdropToCanvas();
          bitmapSelectionInteractionRef.current = {
            owner: "lasso",
            itemId: currentItem.id,
            mode: "moving",
            startPointerX: point.x,
            startPointerY: point.y,
            startX: selection.x,
            startY: selection.y,
            didTransform: false,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
          return;
        }

        lassoInteractionRef.current = {
          mode: "pending-new-selection",
          startPointerX: point.x,
          startPointerY: point.y,
          originPoint: point,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }

      clearLassoDraft();
      lassoInteractionRef.current = { mode: "drawing" };
      setLassoPathState([point]);
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    if (activeTool === "Fill") {
      fillConnectedRegion(e);
      return;
    }

    if (activeTool === "Knife") {
      const point = getCanvasPoint(e);
      if (!point) return;

      const knifeSession = getBitmapSelectionSessionForOwner("knife");
      const pieces = [...(knifeSession?.items ?? [])].reverse();
      let rotateTarget: BitmapSelectionSessionItem | null = null;
      let resizeTarget: { piece: BitmapSelectionSessionItem; handle: ResizeHandle } | null = null;
      let moveTarget: BitmapSelectionSessionItem | null = null;

      for (const piece of pieces) {
        const displayRect = getDisplayedBitmapTransformBounds(piece);
        const rotateHandle = piece.allowRotation
          ? resolveRotateHandleAtPoint(displayRect, point, LASSO_RESIZE_HANDLE_SIZE)
          : null;
        const resizeHandle = resolveResizeHandleAtPoint(displayRect, point, LASSO_RESIZE_HANDLE_SIZE);

        if (rotateHandle) {
          rotateTarget = piece;
          break;
        }

        if (resizeHandle) {
          resizeTarget = { piece, handle: resizeHandle };
          break;
        }

        const isInsidePiece =
          point.x >= displayRect.x &&
          point.x <= displayRect.x + displayRect.width &&
          point.y >= displayRect.y &&
          point.y <= displayRect.y + displayRect.height;

        if (!moveTarget && isInsidePiece) {
          moveTarget = piece;
        }
      }

      if (rotateTarget) {
        const baseRect = getDisplayedBitmapTransformRect(rotateTarget);
        setActiveKnifePieceIdState(rotateTarget.id);
        restoreBitmapSelectionBackdropToCanvas();
        bitmapSelectionInteractionRef.current = {
          owner: "knife",
          itemId: rotateTarget.id,
          mode: "rotating",
          startAngle: Math.atan2(point.y - (baseRect.y + baseRect.height / 2), point.x - (baseRect.x + baseRect.width / 2)),
          startRotation: rotateTarget.rotation,
          centerX: baseRect.x + baseRect.width / 2,
          centerY: baseRect.y + baseRect.height / 2,
          snapTargetRotation: null,
          didTransform: false,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }

      if (resizeTarget) {
        const baseRect = getDisplayedBitmapTransformRect(resizeTarget.piece);
        setActiveKnifePieceIdState(resizeTarget.piece.id);
        restoreBitmapSelectionBackdropToCanvas();
        bitmapSelectionInteractionRef.current = {
          owner: "knife",
          itemId: resizeTarget.piece.id,
          mode: "resizing",
          handle: resolveBitmapResizeHandleForRotation(baseRect, resizeTarget.piece.rotation, resizeTarget.handle),
          startPointerX: point.x,
          startPointerY: point.y,
          intentStartPointerX: point.x,
          intentStartPointerY: point.y,
          lastPointerX: point.x,
          lastPointerY: point.y,
          startRotation: resizeTarget.piece.rotation,
          startWidth: resizeTarget.piece.width,
          startHeight: resizeTarget.piece.height,
          startFlipX: resizeTarget.piece.flipX,
          startFlipY: resizeTarget.piece.flipY,
          startX: resizeTarget.piece.x,
          startY: resizeTarget.piece.y,
          intentFamily: null,
          intentLock: null,
          didTransform: false,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }

      if (moveTarget) {
        setActiveKnifePieceIdState(moveTarget.id);
        restoreBitmapSelectionBackdropToCanvas();
        bitmapSelectionInteractionRef.current = {
          owner: "knife",
          itemId: moveTarget.id,
          mode: "moving",
          startPointerX: point.x,
          startPointerY: point.y,
          startX: moveTarget.x,
          startY: moveTarget.y,
          didTransform: false,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }

      if (knifePiecesRef.current.length > 0) {
        deselectKnifePieces();
        return;
      }

      knifeInteractionRef.current = { mode: "drawing" };
      setKnifePathState([point]);
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    if (activeTool === "Shape") {
      const ctx = canvasRef.current?.getContext("2d");
      const canvas = canvasRef.current;
      if (!ctx || !canvas) return;
      const point = getCanvasPoint(e);
      if (!point) return;

      shapeDraftBaseImageRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
      shapeDraftRef.current = {
        startX: point.x,
        startY: point.y,
        endX: point.x,
        endY: point.y,
      };
      isShapeDrawingRef.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    if (activeTool !== "Brush" && activeTool !== "Eraser") return;

    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const point = getCanvasPoint(e);
    if (!point) return;
    const brushVisibility = 1 - brushTransparency / 100;
    const strokeColor = hexToRGBA(brushColor, brushVisibility);
    ctx.globalCompositeOperation = activeTool === "Eraser" ? "destination-out" : "source-over";
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    ctx.lineWidth = activeTool === "Eraser" ? eraserSize : brushSize;
    ctx.strokeStyle = activeTool === "Brush" ? strokeColor : "#000000";

    if (activeTool === "Brush") {
      const useBufferedPreview = brushToolVariant !== "Brush" || brushSmoothing > 0;
      const useOverlayPreview = false;
      brushUsesBufferedPreviewRef.current = useBufferedPreview;
      resetBrushStrokePreviewState();
      brushUsesOverlayPreviewRef.current = useOverlayPreview;
      brushStrokeColorRef.current = strokeColor;
      brushStrokeSizeRef.current = brushSize;
      brushStrokeSmoothingRef.current = brushSmoothing;
      brushStrokeGradientBrightnessRef.current = glowGradientBrightness;
      brushStrokeGradientRadiusRef.current = glowGradientRadius;
      brushStrokeVariantRef.current = brushToolVariant;
      brushPreviousPointRef.current = point;
      brushDidMoveRef.current = false;

      if (useBufferedPreview) {
        brushStrokePointsRef.current = [point];
        brushStrokeStartupPreviewBudgetRef.current = 2;
        const previewCtx = useOverlayPreview ? foregroundCanvasRef.current?.getContext("2d") : ctx;
        if (previewCtx) {
          drawBufferedBrushStroke(
            previewCtx,
            true,
            useOverlayPreview ? "overlay-preview" : "buffered-main-preview",
          );
        }
        brushStrokeProcessedPointCountRef.current = 1;
      } else {
        ctx.beginPath();
        ctx.arc(point.x, point.y, Math.max(0.5, brushSize / 2), 0, Math.PI * 2);
        ctx.fillStyle = strokeColor;
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
        markAuthoringDirtyRegion(
          resolveSimpleStrokeDirtyRect([point], ctx.canvas.width, ctx.canvas.height, brushSize, true),
          true,
        );
      }
    }

    if (activeTool === "Eraser") {
      // Ensure single-click erase is reliable even with no pointer movement.
      ctx.beginPath();
      ctx.arc(point.x, point.y, eraserSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      brushPreviousPointRef.current = point;
      brushDidMoveRef.current = false;
      markAuthoringDirtyRegion(
        resolveSimpleStrokeDirtyRect([point], ctx.canvas.width, ctx.canvas.height, eraserSize, true),
        true,
      );
    }

    isDrawingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const moveCanvasStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (placedImageInteractionRef.current && activePlacedImageAssetRef.current) {
      const point = getCanvasPoint(e);
      const interaction = placedImageInteractionRef.current;
      const placedAsset = activePlacedImageAssetRef.current;
      if (!point || !interaction || !placedAsset) return;

      if (interaction.mode === "moving") {
        setActivePlacedImageAsset({
          ...placedAsset,
          x: interaction.startX + (point.x - interaction.startPointerX),
          y: interaction.startY + (point.y - interaction.startPointerY),
        });
        return;
      }

      if (interaction.mode === "rotating") {
        const currentAngle = Math.atan2(point.y - interaction.centerY, point.x - interaction.centerX);
        const rotationDelta = getRotationDeltaDegrees(interaction.startAngle, currentAngle);
        const snappedRotation = resolveSnappedRotationDegrees(
          interaction.startRotation + rotationDelta,
          interaction.snapTargetRotation,
        );
        interaction.snapTargetRotation = snappedRotation.snapTargetRotation;
        setActivePlacedImageAsset({
          ...placedAsset,
          rotation: snappedRotation.rotation,
        });
        return;
      }

      const rawDeltaX = point.x - interaction.startPointerX;
      const rawDeltaY = point.y - interaction.startPointerY;
      const nextResizeResponse = resolveResizeIntentLock(
        interaction.handle,
        rawDeltaX,
        rawDeltaY,
        LASSO_RESIZE_HANDLE_SIZE,
        interaction.intentLock,
      );
      const nextDisplayRect = resolveBitmapResizeRectFromInteraction(
        interaction,
        interaction.handle,
        nextResizeResponse.deltaX,
        nextResizeResponse.deltaY,
        24,
        24,
      );
      const nextHandle = remapResizeHandleForFlipParity(
        interaction.handle,
        interaction.startFlipX,
        interaction.startFlipY,
        nextDisplayRect.flipX,
        nextDisplayRect.flipY,
      );
      if (shouldRebaseBitmapResizeInteraction(
        interaction,
        nextDisplayRect,
        nextHandle,
        nextResizeResponse.intentLock,
      )) {
        rebaseBitmapResizeInteraction(interaction, point, nextDisplayRect, nextResizeResponse.intentLock, nextHandle);
      } else {
        interaction.intentLock = nextResizeResponse.intentLock;
      }
      interaction.lastPointerX = point.x;
      interaction.lastPointerY = point.y;
      const nextTransform = getBitmapTransformFromDisplayRect(nextDisplayRect);

      setActivePlacedImageAsset({
        ...placedAsset,
        ...nextTransform,
      });
      return;
    }

    if (bitmapSelectionInteractionRef.current) {
      const point = getCanvasPoint(e);
      const interaction = bitmapSelectionInteractionRef.current;
      if (!point || !interaction) {
        return;
      }

      const currentItem = getBitmapSelectionSessionItem(interaction.owner, interaction.itemId);
      if (!currentItem) {
        return;
      }

      if (interaction.mode === "moving") {
        const nextX = interaction.startX + (point.x - interaction.startPointerX);
        const nextY = interaction.startY + (point.y - interaction.startPointerY);
        if (nextX !== currentItem.x || nextY !== currentItem.y) {
          updateBitmapSelectionSessionItem(interaction.owner, interaction.itemId, (item) => ({
            ...item,
            x: nextX,
            y: nextY,
          }));
          interaction.didTransform = true;
        }
        return;
      }

      if (interaction.mode === "rotating") {
        const currentAngle = Math.atan2(point.y - interaction.centerY, point.x - interaction.centerX);
        const rotationDelta = getRotationDeltaDegrees(interaction.startAngle, currentAngle);
        const snappedRotation = resolveSnappedRotationDegrees(
          interaction.startRotation + rotationDelta,
          interaction.snapTargetRotation,
        );
        interaction.snapTargetRotation = snappedRotation.snapTargetRotation;
        if (snappedRotation.rotation !== currentItem.rotation) {
          updateBitmapSelectionSessionItem(interaction.owner, interaction.itemId, (item) => ({
            ...item,
            rotation: snappedRotation.rotation,
          }));
          interaction.didTransform = true;
        }
        return;
      }

      const rawDelta = projectBitmapResizeDeltaToLocalAxes(
        point.x - interaction.startPointerX,
        point.y - interaction.startPointerY,
        interaction.startRotation,
      );
      const rawDeltaX = rawDelta.x;
      const rawDeltaY = rawDelta.y;
      let intentDeltaX = point.x - interaction.intentStartPointerX;
      let intentDeltaY = point.y - interaction.intentStartPointerY;
      const intentDistance = Math.hypot(intentDeltaX, intentDeltaY);
      if (intentDistance > BITMAP_CORNER_INTENT_WINDOW_PX) {
        const overflowDistance = intentDistance - BITMAP_CORNER_INTENT_WINDOW_PX;
        interaction.intentStartPointerX += (intentDeltaX / intentDistance) * overflowDistance;
        interaction.intentStartPointerY += (intentDeltaY / intentDistance) * overflowDistance;
        intentDeltaX = point.x - interaction.intentStartPointerX;
        intentDeltaY = point.y - interaction.intentStartPointerY;
      }
      const intentDelta = projectBitmapResizeDeltaToLocalAxes(
        intentDeltaX,
        intentDeltaY,
        interaction.startRotation,
      );
      const nextResizeResponse = resolveBitmapSelectionResizeIntentLock(
        interaction.handle,
        rawDeltaX,
        rawDeltaY,
        intentDelta.x,
        intentDelta.y,
        LASSO_RESIZE_HANDLE_SIZE,
        interaction.intentLock,
        interaction.intentFamily,
      );
      const minSelectionSize = interaction.owner === "select" ? 12 : 6;
      let nextRect: ResolvedResizeRect;
      let nextHandle: ResizeHandle;
      let committedIntentLock: ResizeIntentLock | null;
      let committedIntentFamily: BitmapCornerIntentFamily | null;
      let shouldRebaseForMinimumClamp = false;

      if (nextResizeResponse.shouldRebaseSegment && interaction.intentLock != null) {
        const transitionIntentLock = nextResizeResponse.intentLock ?? interaction.intentLock;
        const previousRawDelta = projectBitmapResizeDeltaToLocalAxes(
          interaction.lastPointerX - interaction.startPointerX,
          interaction.lastPointerY - interaction.startPointerY,
          interaction.startRotation,
        );
        const previousResizeResponse = applyBitmapCornerResizeIntentLock(
          interaction.handle,
          previousRawDelta.x,
          previousRawDelta.y,
          interaction.intentLock,
        );
        const previousRect = resolveBitmapResizeRectFromInteraction(
          interaction,
          interaction.handle,
          previousResizeResponse.deltaX,
          previousResizeResponse.deltaY,
          minSelectionSize,
          minSelectionSize,
        );
        const previousHandle = remapResizeHandleForFlipParity(
          interaction.handle,
          interaction.startFlipX,
          interaction.startFlipY,
          previousRect.flipX,
          previousRect.flipY,
        );
        const previousTransform = getBitmapTransformFromDisplayRect(previousRect);
        const transitionStepDelta = projectBitmapResizeDeltaToLocalAxes(
          point.x - interaction.lastPointerX,
          point.y - interaction.lastPointerY,
          interaction.startRotation,
        );
        const transitionInteraction: BitmapResizeInteractionState = {
          handle: previousHandle,
          startPointerX: interaction.lastPointerX,
          startPointerY: interaction.lastPointerY,
          intentStartPointerX: interaction.lastPointerX,
          intentStartPointerY: interaction.lastPointerY,
          lastPointerX: point.x,
          lastPointerY: point.y,
          startRotation: interaction.startRotation,
          startWidth: previousTransform.width,
          startHeight: previousTransform.height,
          startFlipX: previousTransform.flipX,
          startFlipY: previousTransform.flipY,
          startX: previousTransform.x,
          startY: previousTransform.y,
          intentFamily: nextResizeResponse.intentFamily,
          intentLock: transitionIntentLock,
        };
        const transitionResizeResponse = applyBitmapCornerResizeIntentLock(
          previousHandle,
          transitionStepDelta.x,
          transitionStepDelta.y,
          transitionIntentLock,
        );
        nextRect = resolveBitmapResizeRectFromInteraction(
          transitionInteraction,
          previousHandle,
          transitionResizeResponse.deltaX,
          transitionResizeResponse.deltaY,
          minSelectionSize,
          minSelectionSize,
        );
        shouldRebaseForMinimumClamp = isBitmapResizePinnedToMinimumSize(
          transitionInteraction,
          previousHandle,
          transitionResizeResponse.deltaX,
          transitionResizeResponse.deltaY,
          minSelectionSize,
          minSelectionSize,
        );
        nextHandle = remapResizeHandleForFlipParity(
          previousHandle,
          transitionInteraction.startFlipX,
          transitionInteraction.startFlipY,
          nextRect.flipX,
          nextRect.flipY,
        );
        committedIntentLock = transitionIntentLock;
        committedIntentFamily = nextResizeResponse.intentFamily;
      } else {
        nextRect = resolveBitmapResizeRectFromInteraction(
          interaction,
          interaction.handle,
          nextResizeResponse.deltaX,
          nextResizeResponse.deltaY,
          minSelectionSize,
          minSelectionSize,
        );
        shouldRebaseForMinimumClamp = isBitmapResizePinnedToMinimumSize(
          interaction,
          interaction.handle,
          nextResizeResponse.deltaX,
          nextResizeResponse.deltaY,
          minSelectionSize,
          minSelectionSize,
        );
        nextHandle = remapResizeHandleForFlipParity(
          interaction.handle,
          interaction.startFlipX,
          interaction.startFlipY,
          nextRect.flipX,
          nextRect.flipY,
        );
        committedIntentLock = nextResizeResponse.intentLock;
        committedIntentFamily = nextResizeResponse.intentFamily;
      }

      if (
        nextResizeResponse.shouldRebaseSegment ||
        shouldRebaseForMinimumClamp ||
        shouldRebaseBitmapResizeInteraction(
          interaction,
          nextRect,
          nextHandle,
          committedIntentLock,
          { rebaseOnIntentLockChange: false },
        )
      ) {
        rebaseBitmapResizeInteraction(
          interaction,
          point,
          nextRect,
          committedIntentLock,
          nextHandle,
        );
        interaction.intentFamily = committedIntentFamily;
      } else {
        interaction.intentLock = committedIntentLock;
        interaction.intentFamily = committedIntentFamily;
      }
      interaction.lastPointerX = point.x;
      interaction.lastPointerY = point.y;
      const nextTransform = getBitmapTransformFromDisplayRect(nextRect);

      if (
        nextTransform.x !== currentItem.x ||
        nextTransform.y !== currentItem.y ||
        nextTransform.width !== currentItem.width ||
        nextTransform.height !== currentItem.height ||
        nextTransform.flipX !== currentItem.flipX ||
        nextTransform.flipY !== currentItem.flipY
      ) {
        updateBitmapSelectionSessionItem(interaction.owner, interaction.itemId, (item) => ({
          ...item,
          ...nextTransform,
        }));
        interaction.didTransform = true;
      }
      return;
    }

    if ((activeTool === "Text" || activeTool === "Select" || activeTool === "Lasso") && textInteractionRef.current) {
      const point = getCanvasPoint(e);
      const interaction = textInteractionRef.current;
      if (!point || !interaction) return;

      const nextDraftObjects = cloneDrawingTextObjects(textDraftObjectsRef.current ?? activeTextObjects);
      const initialObjectMap = new Map(interaction.initialObjects.map((textObject) => [textObject.id, textObject]));
      const deltaX = point.x - interaction.startPointerX;
      const deltaY = point.y - interaction.startPointerY;

      if (interaction.mode === "moving") {
        for (let index = 0; index < nextDraftObjects.length; index += 1) {
          const initialObject = initialObjectMap.get(nextDraftObjects[index].id);
          if (!initialObject) {
            continue;
          }

          nextDraftObjects[index] = {
            ...nextDraftObjects[index],
            x: initialObject.x + deltaX,
            y: initialObject.y + deltaY,
          };
        }
      } else if (interaction.mode === "resizing") {
        if (isCornerResizeHandle(interaction.handle)) {
          const rawDeltaX = point.x - interaction.startPointerX;
          const rawDeltaY = point.y - interaction.startPointerY;
          let intentDeltaX = point.x - interaction.intentStartPointerX;
          let intentDeltaY = point.y - interaction.intentStartPointerY;
          const intentDistance = Math.hypot(intentDeltaX, intentDeltaY);
          if (intentDistance > BITMAP_CORNER_INTENT_WINDOW_PX) {
            const overflowDistance = intentDistance - BITMAP_CORNER_INTENT_WINDOW_PX;
            interaction.intentStartPointerX += (intentDeltaX / intentDistance) * overflowDistance;
            interaction.intentStartPointerY += (intentDeltaY / intentDistance) * overflowDistance;
            intentDeltaX = point.x - interaction.intentStartPointerX;
            intentDeltaY = point.y - interaction.intentStartPointerY;
          }

          const nextResizeResponse = resolveBitmapSelectionResizeIntentLock(
            interaction.handle,
            rawDeltaX,
            rawDeltaY,
            intentDeltaX,
            intentDeltaY,
            LASSO_RESIZE_HANDLE_SIZE,
            interaction.intentLock,
            interaction.intentFamily,
          );
          let nextSelectionRect: ResolvedResizeRect;
          let nextHandle: ResizeHandle;
          let resizedDraftObjects: DrawingTextObject[];
          let committedIntentLock = nextResizeResponse.intentLock;
          let committedIntentFamily = nextResizeResponse.intentFamily;
          let shouldRebaseInteraction = false;

          if (nextResizeResponse.shouldRebaseSegment && interaction.intentLock != null) {
            const transitionIntentLock = nextResizeResponse.intentLock ?? interaction.intentLock;
            const previousResizeResponse = applyBitmapCornerResizeIntentLock(
              interaction.handle,
              interaction.lastPointerX - interaction.startPointerX,
              interaction.lastPointerY - interaction.startPointerY,
              interaction.intentLock,
            );
            const previousSelectionRect = resolveResizedRectFromHandle(
              interaction.startBounds,
              interaction.handle,
              previousResizeResponse.deltaX,
              previousResizeResponse.deltaY,
              48,
              24,
            );
            const previousDraftObjects = buildResizedTextDraftObjects(
              nextDraftObjects,
              interaction.initialObjects,
              interaction.startBounds,
              previousSelectionRect,
              { reconcileVerticalTextWidth: interaction.intentLock === "vertical" },
            );
            const previousBounds =
              measureTextSelectionBounds(previousDraftObjects, interaction.objectIds) ??
              {
                x: previousSelectionRect.x,
                y: previousSelectionRect.y,
                width: previousSelectionRect.width,
                height: previousSelectionRect.height,
              };
            const previousInitialObjects = buildTextInteractionInitialObjects(previousDraftObjects, interaction.objectIds);
            const previousHandle = remapResizeHandleForFlipParity(
              interaction.handle,
              false,
              false,
              previousSelectionRect.flipX,
              previousSelectionRect.flipY,
            );
            const transitionResizeResponse = applyBitmapCornerResizeIntentLock(
              previousHandle,
              point.x - interaction.lastPointerX,
              point.y - interaction.lastPointerY,
              transitionIntentLock,
            );
            nextSelectionRect = resolveResizedRectFromHandle(
              previousBounds,
              previousHandle,
              transitionResizeResponse.deltaX,
              transitionResizeResponse.deltaY,
              48,
              24,
            );
            nextHandle = remapResizeHandleForFlipParity(
              previousHandle,
              false,
              false,
              nextSelectionRect.flipX,
              nextSelectionRect.flipY,
            );
            resizedDraftObjects = buildResizedTextDraftObjects(
              previousDraftObjects,
              previousInitialObjects.length > 0 ? previousInitialObjects : interaction.initialObjects,
              previousBounds,
              nextSelectionRect,
              { reconcileVerticalTextWidth: transitionIntentLock === "vertical" },
            );
            committedIntentLock = transitionIntentLock;
            committedIntentFamily = nextResizeResponse.intentFamily;
            shouldRebaseInteraction = true;
          } else {
            nextSelectionRect = resolveResizedRectFromHandle(
              interaction.startBounds,
              interaction.handle,
              nextResizeResponse.deltaX,
              nextResizeResponse.deltaY,
              48,
              24,
            );
            nextHandle = remapResizeHandleForFlipParity(
              interaction.handle,
              false,
              false,
              nextSelectionRect.flipX,
              nextSelectionRect.flipY,
            );
            resizedDraftObjects = buildResizedTextDraftObjects(
              nextDraftObjects,
              interaction.initialObjects,
              interaction.startBounds,
              nextSelectionRect,
              { reconcileVerticalTextWidth: nextResizeResponse.intentLock === "vertical" },
            );
            shouldRebaseInteraction =
              nextSelectionRect.flipX ||
              nextSelectionRect.flipY ||
              nextHandle !== interaction.handle;
          }

          if (shouldRebaseInteraction) {
            interaction.startPointerX = point.x;
            interaction.startPointerY = point.y;
            interaction.intentStartPointerX = point.x;
            interaction.intentStartPointerY = point.y;
            interaction.startBounds =
              measureTextSelectionBounds(resizedDraftObjects, interaction.objectIds) ??
              {
                x: nextSelectionRect.x,
                y: nextSelectionRect.y,
                width: nextSelectionRect.width,
                height: nextSelectionRect.height,
              };
            const rebasedInitialObjects = buildTextInteractionInitialObjects(resizedDraftObjects, interaction.objectIds);
            if (rebasedInitialObjects.length > 0) {
              interaction.initialObjects = rebasedInitialObjects;
            }
            interaction.handle = nextHandle;
          }

          interaction.intentLock = committedIntentLock;
          interaction.intentFamily = committedIntentFamily;
          interaction.lastPointerX = point.x;
          interaction.lastPointerY = point.y;
          setTextDraftObjects(resizedDraftObjects);
          return;
        }

        const stepDeltaX = point.x - interaction.lastPointerX;
        const stepDeltaY = point.y - interaction.lastPointerY;
        const nextResizeResponse = resolveResizeIntentLock(
          interaction.handle,
          stepDeltaX,
          stepDeltaY,
          LASSO_RESIZE_HANDLE_SIZE,
          interaction.intentLock,
        );
        const nextSelectionRect = resolveResizedRectFromHandle(
          interaction.startBounds,
          interaction.handle,
          nextResizeResponse.deltaX,
          nextResizeResponse.deltaY,
          48,
          24,
        );
        const nextHandle = remapResizeHandleForFlipParity(
          interaction.handle,
          false,
          false,
          nextSelectionRect.flipX,
          nextSelectionRect.flipY,
        );
        const resizedDraftObjects = buildResizedTextDraftObjects(
          nextDraftObjects,
          interaction.initialObjects,
          interaction.startBounds,
          nextSelectionRect,
          { reconcileVerticalTextWidth: nextResizeResponse.intentLock === "vertical" },
        );
        interaction.startPointerX = point.x;
        interaction.startPointerY = point.y;
        interaction.startBounds =
          measureTextSelectionBounds(resizedDraftObjects, interaction.objectIds) ??
          {
            x: nextSelectionRect.x,
            y: nextSelectionRect.y,
            width: nextSelectionRect.width,
            height: nextSelectionRect.height,
          };
        const rebasedInitialObjects = buildTextInteractionInitialObjects(resizedDraftObjects, interaction.objectIds);
        if (rebasedInitialObjects.length > 0) {
          interaction.initialObjects = rebasedInitialObjects;
        }
        interaction.intentLock = nextResizeResponse.intentLock;
        interaction.intentFamily = null;
        interaction.handle = nextHandle;
        interaction.lastPointerX = point.x;
        interaction.lastPointerY = point.y;
        setTextDraftObjects(resizedDraftObjects);
        return;
      } else {
        const centerX = interaction.startBounds.x + interaction.startBounds.width / 2;
        const centerY = interaction.startBounds.y + interaction.startBounds.height / 2;
        const currentAngle = Math.atan2(point.y - centerY, point.x - centerX);
        const rotationDelta = getRotationDeltaDegrees(interaction.startAngle, currentAngle);
        const snappedRotation = resolveSnappedRotationDegrees(
          interaction.rotationReference + rotationDelta,
          interaction.snapTargetRotation,
        );
        interaction.snapTargetRotation = snappedRotation.snapTargetRotation;
        const effectiveRotationDelta = normalizeContinuousRotation(
          snappedRotation.rotation - interaction.rotationReference,
        );
        const radians = (effectiveRotationDelta * Math.PI) / 180;
        const cos = Math.cos(radians);
        const sin = Math.sin(radians);

        for (let index = 0; index < nextDraftObjects.length; index += 1) {
          const initialObject = initialObjectMap.get(nextDraftObjects[index].id);
          if (!initialObject) {
            continue;
          }

          const offsetX = initialObject.displayCenterX - centerX;
          const offsetY = initialObject.displayCenterY - centerY;
          const nextCenterX = centerX + offsetX * cos - offsetY * sin;
          const nextCenterY = centerY + offsetX * sin + offsetY * cos;
          const nextRotation = normalizeDrawingTextRotation((initialObject.rotation ?? 0) + effectiveRotationDelta);

          nextDraftObjects[index] = {
            ...nextDraftObjects[index],
            rotation: nextRotation,
            x: initialObject.flipX
              ? nextCenterX + initialObject.displayWidth / 2
              : nextCenterX - initialObject.displayWidth / 2,
            y: initialObject.flipY
              ? nextCenterY + initialObject.displayHeight / 2
              : nextCenterY - initialObject.displayHeight / 2,
          };
        }
      }

      setTextDraftObjects(nextDraftObjects);
      return;
    }

    if (activeTool === "Select" && !canvasMovementEnabled && selectionBoxDraft) {
      const point = getCanvasPoint(e);
      if (!point) return;
      setSelectionBoxDraft((prev) => (prev ? { ...prev, end: point } : prev));
      return;
    }

    if (activeTool === "Lasso") {
      const point = getCanvasPoint(e);
      const interaction = lassoInteractionRef.current;
      if (!point || !interaction) return;

      if (interaction.mode === "drawing") {
        const path = lassoPathRef.current;
        const lastPoint = path[path.length - 1];
        if (!lastPoint) return;
        const dx = point.x - lastPoint.x;
        const dy = point.y - lastPoint.y;
        if (Math.hypot(dx, dy) < LASSO_MIN_POINT_DISTANCE) return;
        setLassoPathState([...path, point]);
        return;
      }

      if (interaction.mode === "pending-new-selection") {
        const dx = point.x - interaction.startPointerX;
        const dy = point.y - interaction.startPointerY;
        if (Math.hypot(dx, dy) < LASSO_DESELECT_DRAG_THRESHOLD) {
          return;
        }

        const didCommit = commitLassoSelectionToCanvas();
        if (!didCommit) {
          return;
        }
        clearLassoDraft();
        lassoInteractionRef.current = { mode: "drawing" };
        setLassoPathState([interaction.originPoint, point]);
        return;
      }

      return;
    }

    if (activeTool === "Knife") {
      const point = getCanvasPoint(e);
      const interaction = knifeInteractionRef.current;
      if (!point || !interaction) return;

      if (interaction.mode === "drawing") {
        const path = knifePathRef.current;
        if (path.length === 0) return;
        if (knifeStraightLine) {
          setKnifePathState([path[0], point]);
          return;
        }
        const lastPoint = path[path.length - 1];
        if (!lastPoint) return;
        const dx = point.x - lastPoint.x;
        const dy = point.y - lastPoint.y;
        if (Math.hypot(dx, dy) < LASSO_MIN_POINT_DISTANCE) return;
        setKnifePathState([...path, point]);
        return;
      }

      return;
    }

    if (isShapeDrawingRef.current && activeTool === "Shape") {
      const draft = shapeDraftRef.current;
      const point = getCanvasPoint(e);
      if (!draft || !point) return;

      draft.endX = point.x;
      draft.endY = point.y;
      scheduleShapePreview();
      return;
    }

    if (!isDrawingRef.current || (activeTool !== "Brush" && activeTool !== "Eraser")) return;

    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    const point = getCanvasPoint(e);
    if (!point) return;
    if (activeTool === "Brush") {
      const previousPoint = brushPreviousPointRef.current;
      if (!previousPoint) {
        brushPreviousPointRef.current = point;
        if (brushUsesBufferedPreviewRef.current) {
          brushStrokePointsRef.current = [point];
        }
        return;
      }
      if (Math.hypot(point.x - previousPoint.x, point.y - previousPoint.y) < 0.001) return;
      if (brushUsesBufferedPreviewRef.current) {
        brushStrokePointsRef.current.push(point);
        if (brushStrokeStartupPreviewBudgetRef.current > 0) {
          brushStrokeStartupPreviewBudgetRef.current -= 1;
          flushBrushPreviewImmediately();
        } else {
          scheduleBrushPreview();
        }
      } else {
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
        markAuthoringDirtyRegion(
          resolveSimpleStrokeDirtyRect(
            [previousPoint, point],
            ctx.canvas.width,
            ctx.canvas.height,
            brushSize,
            false,
          ),
          true,
        );
      }
      brushPreviousPointRef.current = point;
      brushDidMoveRef.current = true;
      return;
    }

    const previousPoint = brushPreviousPointRef.current;
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    markAuthoringDirtyRegion(
      resolveSimpleStrokeDirtyRect(
        previousPoint ? [previousPoint, point] : [point],
        ctx.canvas.width,
        ctx.canvas.height,
        eraserSize,
        false,
      ),
      true,
    );
    brushPreviousPointRef.current = point;
    brushDidMoveRef.current = true;
  };

  const endCanvasStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (placedImageInteractionRef.current) {
      placedImageInteractionRef.current = null;
      commitPlacedImageAssetToCanvas();
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      return;
    }

    if (bitmapSelectionInteractionRef.current) {
      const interaction = bitmapSelectionInteractionRef.current;
      if (
        e.type === "pointerleave" &&
        interaction.mode === "resizing" &&
        isCornerResizeHandle(interaction.handle) &&
        e.currentTarget.hasPointerCapture(e.pointerId)
      ) {
        return;
      }
      if (interaction.didTransform) {
        onAuthoringActionCommitted?.("selection");
        scheduleBitmapSelectionBackdropRestore();
      }
      bitmapSelectionInteractionRef.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      return;
    }

    if ((activeTool === "Text" || activeTool === "Select" || activeTool === "Lasso") && textInteractionRef.current) {
      if (textDraftObjectsRef.current) {
        commitTextObjects(textDraftObjectsRef.current);
      }
      textInteractionRef.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      return;
    }

    if (activeTool === "Select" && !canvasMovementEnabled && selectionBoxDraft) {
      const point = getCanvasPoint(e);
      const finalDraft = point ? { ...selectionBoxDraft, end: point } : selectionBoxDraft;
      const didCreateSelection = createBoxSelectionFromDraft(finalDraft);
      setSelectionBoxDraft(null);
      if (didCreateSelection) {
        setRightPanelTab("Properties");
      } else {
        resetBoxSelectionState();
      }
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      return;
    }

    if (activeTool === "Lasso") {
      const interaction = lassoInteractionRef.current;
      if (!interaction) return;

      if (interaction.mode === "drawing") {
        const point = getCanvasPoint(e);
        const completedPath = point ? [...lassoPathRef.current, point] : lassoPathRef.current;
        setLassoPathState(completedPath);
        createLassoSelection(completedPath);
        setLassoPathState([]);
      }

      if (interaction.mode === "pending-new-selection") {
        const didCommit = commitLassoSelectionToCanvas();
        if (didCommit) {
          clearLassoDraft();
        }
      }

      lassoInteractionRef.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      return;
    }

    if (activeTool === "Knife") {
      const interaction = knifeInteractionRef.current;
      if (!interaction) return;

      if (interaction.mode === "drawing") {
        const point = getCanvasPoint(e);
        const currentPath = knifePathRef.current;
        const completedPath = point
          ? knifeStraightLine
            ? currentPath.length > 0
              ? [currentPath[0], point]
              : [point]
            : [...currentPath, point]
          : currentPath;
        const finalPath = knifeStraightLine ? completedPath : smoothKnifePath(completedPath, knifeSmoothing);
        setKnifePathState(finalPath);
        createKnifeCutSelection(finalPath);
        setKnifePathState([]);
      }

      knifeInteractionRef.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      return;
    }

    if (isShapeDrawingRef.current && activeTool === "Shape") {
      cancelShapePreview();
      const ctx = canvasRef.current?.getContext("2d");
      const draft = shapeDraftRef.current;
      const baseImage = shapeDraftBaseImageRef.current;
      const point = getCanvasPoint(e);
      let didCommitShape = false;
      if (ctx && draft && baseImage && point) {
        draft.endX = point.x;
        draft.endY = point.y;
        ctx.putImageData(baseImage, 0, 0);
        commitShapeToCanvas(ctx, shapeType, shapeMode, draft.startX, draft.startY, draft.endX, draft.endY);
        markAuthoringDirty();
        didCommitShape = true;
      }

      isShapeDrawingRef.current = false;
      shapeDraftRef.current = null;
      shapeDraftBaseImageRef.current = null;
      if (didCommitShape) {
        onAuthoringActionCommitted?.("shape");
      }
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      return;
    }

    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    const ctx = canvasRef.current?.getContext("2d");
    let didCommitStroke = false;
    if (ctx) {
      if (activeTool === "Brush" && brushPreviousPointRef.current) {
        const point = getCanvasPoint(e);
        if (brushUsesBufferedPreviewRef.current) {
          cancelBrushPreview();
        }
        if (point) {
          const previousPoint = brushPreviousPointRef.current;
          if (Math.hypot(point.x - previousPoint.x, point.y - previousPoint.y) >= 0.001) {
            if (brushUsesBufferedPreviewRef.current) {
              brushStrokePointsRef.current.push(point);
            } else {
              ctx.lineTo(point.x, point.y);
              ctx.stroke();
              ctx.beginPath();
              ctx.moveTo(point.x, point.y);
              markAuthoringDirtyRegion(
                resolveSimpleStrokeDirtyRect(
                  [previousPoint, point],
                  ctx.canvas.width,
                  ctx.canvas.height,
                  brushStrokeSizeRef.current,
                  false,
                ),
                true,
              );
            }
            brushPreviousPointRef.current = point;
            brushDidMoveRef.current = true;
          }
        }
        if (brushUsesBufferedPreviewRef.current) {
          drawBufferedBrushStroke(ctx, !brushDidMoveRef.current, "final-commit");
          if (brushUsesOverlayPreviewRef.current) {
            clearBrushPreviewOverlay();
          }
        }
      }
      ctx.closePath();
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      markAuthoringPendingChanges();
      didCommitStroke = true;
    }
    brushPreviousPointRef.current = null;
    brushDidMoveRef.current = false;
    resetBrushStrokePreviewState();
    brushUsesBufferedPreviewRef.current = true;
    if (didCommitStroke) {
      onAuthoringActionCommitted?.("stroke");
    }
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const updateCameraZoom = (nextZoomRaw: number) => {
    const nextZoom = clamp(nextZoomRaw, MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM);
    setCameraZoom(nextZoom);
    setCameraPan((prev) => clampPan(prev, nextZoom));
    return nextZoom;
  };

  const zoomCanvas = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const metrics = getAuthoringMetrics();
    if (!metrics) return;

    const centerX = metrics.hostRect.width / 2;
    const centerY = metrics.hostRect.height / 2;
    const hostX = e.clientX - metrics.hostRect.left;
    const hostY = e.clientY - metrics.hostRect.top;

    const nextZoom = clamp(cameraZoom * Math.exp(-e.deltaY * 0.0015), MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM);
    if (nextZoom === cameraZoom) return;

    const worldX = (hostX - centerX - cameraPan.x) / cameraZoom + metrics.worldCenterX;
    const worldY = (hostY - centerY - cameraPan.y) / cameraZoom + metrics.worldCenterY;
    const nextPan = {
      x: hostX - centerX - (worldX - metrics.worldCenterX) * nextZoom,
      y: hostY - centerY - (worldY - metrics.worldCenterY) * nextZoom,
    };

    updateCameraZoom(nextZoom);
    setCameraPan(clampPan(nextPan, nextZoom));
  };

  const resetCanvasView = () => {
    updateCameraZoom(DEFAULT_CAMERA_ZOOM);
    setCameraPan(DEFAULT_CAMERA_PAN);
  };

  const clearCanvasContent = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    if (!window.confirm("Clear the current canvas? This will remove the visible artwork on this canvas.")) return;
    clearBrushPreviewOverlay();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    markAuthoringDirty();
    onAuthoringActionCommitted?.("clear-canvas");
  };

  const startSelectPan = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeTool !== "Select" || !canvasMovementEnabled) return;
    isPanningRef.current = true;
    setIsPanning(true);
    panStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      startPanX: cameraPan.x,
      startPanY: cameraPan.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const moveSelectPan = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanningRef.current || activeTool !== "Select" || !canvasMovementEnabled) return;
    const panStart = panStartRef.current;
    if (!panStart) return;
    const nextPan = {
      x: panStart.startPanX + (e.clientX - panStart.pointerX),
      y: panStart.startPanY + (e.clientY - panStart.pointerY),
    };
    setCameraPan(clampPan(nextPan, cameraZoom));
  };

  const endSelectPan = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanningRef.current) return;
    isPanningRef.current = false;
    setIsPanning(false);
    panStartRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const applyZoomInput = () => {
    const match = zoomInputValue.match(/-?\d+(\.\d+)?/);
    if (!match) {
      setZoomInputValue(`${Math.round(cameraZoom * 100)}%`);
      return;
    }

    const parsedPercent = Number(match[0]);
    if (!Number.isFinite(parsedPercent)) {
      setZoomInputValue(`${Math.round(cameraZoom * 100)}%`);
      return;
    }

    const nextZoom = updateCameraZoom(parsedPercent / 100);
    setZoomInputValue(`${Math.round(nextZoom * 100)}%`);
  };

  const formatAssetSize = (size: number) => {
    if (!Number.isFinite(size) || size <= 0) return "unknown size";
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  const loadImageDimensions = (url: string) =>
    new Promise<{ width: number | null; height: number | null }>((resolve) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth || null, height: image.naturalHeight || null });
      image.onerror = () => resolve({ width: null, height: null });
      image.src = url;
    });

  const handleAssetImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const filesToImport: File[] = [];
    let hasDuplicate = false;

    for (const file of files) {
      const isDuplicate =
        importedAssetsRef.current.some((asset) => asset.name === file.name) || pendingAssetImportNamesRef.current.has(file.name);

      if (isDuplicate) {
        hasDuplicate = true;
        continue;
      }

      pendingAssetImportNamesRef.current.add(file.name);
      filesToImport.push(file);
    }

    if (hasDuplicate) {
      window.alert("This asset has already been imported.");
    }

    if (filesToImport.length === 0) {
      e.target.value = "";
      return;
    }

    const nextAssets = await Promise.all(
      filesToImport.map(async (file, index) => {
        const isImage = file.type.startsWith("image/");
        const previewUrl = isImage ? URL.createObjectURL(file) : null;
        if (previewUrl) {
          assetPreviewUrlsRef.current.push(previewUrl);
        }
        const dimensions = previewUrl ? await loadImageDimensions(previewUrl) : { width: null, height: null };
        const sizeLabel = formatAssetSize(file.size);
        const meta = isImage
          ? dimensions.width && dimensions.height
            ? `image • ${dimensions.width}x${dimensions.height}`
            : "image • unknown size"
          : `file • ${sizeLabel}`;

        return {
          id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}-${index}`,
          name: file.name,
          kind: isImage ? "image" : "file",
          sizeLabel,
          meta,
          previewUrl,
          width: dimensions.width,
          height: dimensions.height,
        } satisfies ImportedAsset;
      })
    );

    setImportedAssets((prev) => [...prev, ...nextAssets]);
    filesToImport.forEach((file) => pendingAssetImportNamesRef.current.delete(file.name));
    e.target.value = "";
  };

  const renderTextPropertiesEditor = useCallback(
    (
      title: string,
      emptyMessage: string,
    ) => (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ color: "rgba(255,255,255,0.88)", fontSize: 13, fontWeight: 700 }}>{title}</div>
        {!canEditTextInCurrentFrame ? (
          <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 12 }}>
            Text can be added on existing frame content boxes. Select a non-empty frame to place text.
          </div>
        ) : !selectedTextObject ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, color: "rgba(255,255,255,0.72)", fontSize: 12 }}>
            <div>{emptyMessage}</div>
            <div>Drag inside text to move it, or drag the edge and corner handles to resize with more control.</div>
          </div>
        ) : (
          <>
            <label style={{ display: "flex", flexDirection: "column", gap: 8, color: "rgba(255,255,255,0.76)", fontSize: 12 }}>
              Text
              <textarea
                value={selectedTextObject.text}
                onChange={(e) => {
                  commitSelectedTextObjectUpdate((textObject) => ({
                    ...textObject,
                    text: e.target.value,
                  }));
                }}
                rows={4}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.04)",
                  color: "rgba(255,255,255,0.88)",
                  fontSize: 12,
                  resize: "vertical",
                }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 8, color: "rgba(255,255,255,0.76)", fontSize: 12 }}>
              Font
              <select
                value={selectedTextObject.fontFamily}
                onChange={(e) => {
                  commitSelectedTextObjectUpdate((textObject) => ({
                    ...textObject,
                    fontFamily: e.target.value as DrawingTextObject["fontFamily"],
                  }));
                }}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.04)",
                  color: "rgba(255,255,255,0.88)",
                  fontSize: 12,
                }}
              >
                {DRAWING_TEXT_FONTS.map((fontName) => (
                  <option key={fontName} value={fontName}>
                    {fontName}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 8, color: "rgba(255,255,255,0.76)", fontSize: 12 }}>
              Font size: {Math.round(selectedTextObject.fontSize)}
              <input
                type="range"
                min={10}
                max={140}
                step={1}
                value={selectedTextObject.fontSize}
                onChange={(e) => {
                  commitSelectedTextObjectUpdate((textObject) => ({
                    ...textObject,
                    fontSize: Number(e.target.value),
                  }));
                }}
                style={{ width: "100%" }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 8, color: "rgba(255,255,255,0.76)", fontSize: 12 }}>
              Box width: {Math.round(selectedTextObject.width)}
              <input
                type="range"
                min={48}
                max={800}
                step={1}
                value={selectedTextObject.width}
                onChange={(e) => {
                  commitSelectedTextObjectUpdate((textObject) => ({
                    ...textObject,
                    width: Number(e.target.value),
                  }));
                }}
                style={{ width: "100%" }}
              />
            </label>
            <RotationValueField
              value={selectedTextObject.rotation}
              onCommit={(rotation) => {
                commitSelectedTextObjectRotation(rotation);
              }}
            />
            <label style={{ display: "flex", flexDirection: "column", gap: 8, color: "rgba(255,255,255,0.76)", fontSize: 12 }}>
              Color
              <input
                type="color"
                value={selectedTextObject.color}
                onChange={(e) => {
                  commitSelectedTextObjectUpdate((textObject) => ({
                    ...textObject,
                    color: e.target.value,
                  }));
                }}
                style={{ width: 48, height: 32, padding: 0, border: "none", background: "transparent", cursor: "pointer" }}
              />
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => {
                  commitSelectedTextObjectUpdate((textObject) => ({
                    ...textObject,
                    bold: !textObject.bold,
                  }));
                }}
                style={{
                  minHeight: 34,
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: selectedTextObject.bold ? "1px solid rgba(110,170,255,0.34)" : "1px solid rgba(255,255,255,0.12)",
                  background: selectedTextObject.bold ? "rgba(110,170,255,0.10)" : "rgba(255,255,255,0.04)",
                  color: selectedTextObject.bold ? "rgba(225,238,255,0.92)" : "rgba(255,255,255,0.82)",
                  fontSize: 12,
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                Bold
              </button>
              <button
                type="button"
                onClick={() => {
                  commitSelectedTextObjectUpdate((textObject) => ({
                    ...textObject,
                    italic: !textObject.italic,
                  }));
                }}
                style={{
                  minHeight: 34,
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: selectedTextObject.italic ? "1px solid rgba(110,170,255,0.34)" : "1px solid rgba(255,255,255,0.12)",
                  background: selectedTextObject.italic ? "rgba(110,170,255,0.10)" : "rgba(255,255,255,0.04)",
                  color: selectedTextObject.italic ? "rgba(225,238,255,0.92)" : "rgba(255,255,255,0.82)",
                  fontSize: 12,
                  cursor: "pointer",
                  fontStyle: "italic",
                }}
              >
                Italic
              </button>
              <button
                type="button"
                onClick={() => {
                  commitSelectedTextObjectUpdate((textObject) => ({
                    ...textObject,
                    flipX: !textObject.flipX,
                  }));
                }}
                style={{
                  minHeight: 34,
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: selectedTextObject.flipX ? "1px solid rgba(110,170,255,0.34)" : "1px solid rgba(255,255,255,0.12)",
                  background: selectedTextObject.flipX ? "rgba(110,170,255,0.10)" : "rgba(255,255,255,0.04)",
                  color: selectedTextObject.flipX ? "rgba(225,238,255,0.92)" : "rgba(255,255,255,0.82)",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Flip X
              </button>
              <button
                type="button"
                onClick={() => {
                  commitSelectedTextObjectUpdate((textObject) => ({
                    ...textObject,
                    flipY: !textObject.flipY,
                  }));
                }}
                style={{
                  minHeight: 34,
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: selectedTextObject.flipY ? "1px solid rgba(110,170,255,0.34)" : "1px solid rgba(255,255,255,0.12)",
                  background: selectedTextObject.flipY ? "rgba(110,170,255,0.10)" : "rgba(255,255,255,0.04)",
                  color: selectedTextObject.flipY ? "rgba(225,238,255,0.92)" : "rgba(255,255,255,0.82)",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Flip Y
              </button>
              <button
                type="button"
                onClick={() => {
                  if (deleteSelectedTextObjects([selectedTextObject.id])) {
                    clearTextSelectionState();
                  }
                }}
                style={{
                  minHeight: 34,
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,120,120,0.28)",
                  background: "rgba(255,80,80,0.10)",
                  color: "rgba(255,228,228,0.92)",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Delete
              </button>
            </div>
          </>
        )}
      </div>
    ),
    [canEditTextInCurrentFrame, clearTextSelectionState, commitSelectedTextObjectRotation, commitSelectedTextObjectUpdate, deleteSelectedTextObjects, selectedTextObject],
  );

  const propertiesTabContent =
    activeTool === "Select" ? (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ color: "rgba(255,255,255,0.92)", fontSize: 14, fontWeight: 800, letterSpacing: 0.4 }}>SELECT TOOL</div>
          <div style={{ color: "rgba(255,255,255,0.62)", fontSize: 12 }}>Navigate and move the canvas</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ color: "rgba(255,255,255,0.52)", fontSize: 11, fontWeight: 700, letterSpacing: 0.7 }}>VIEW</div>
          <label style={{ display: "flex", flexDirection: "column", gap: 8, color: "rgba(255,255,255,0.76)", fontSize: 12 }}>
            Zoom
            <input
              type="text"
              value={zoomInputValue}
              onChange={(e) => setZoomInputValue(e.target.value)}
              onBlur={applyZoomInput}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyZoomInput();
                }
              }}
              style={{
                width: 120,
                padding: "7px 10px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.86)",
                fontSize: 13,
              }}
            />
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start", paddingTop: 2 }}>
            <button
              type="button"
              onClick={resetCanvasView}
              style={{
                width: 168,
                padding: "9px 12px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.86)",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Reset View
            </button>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ color: "rgba(255,255,255,0.52)", fontSize: 11, fontWeight: 700, letterSpacing: 0.7 }}>CANVAS</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ color: "rgba(255,255,255,0.76)", fontSize: 12 }}>Show Canvas</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {([
                { label: "On", value: true },
                { label: "Off", value: false },
              ] as const).map((option) => {
                const isSelected = canvasMovementEnabled === option.value;
                return (
                  <button
                    key={option.label}
                    type="button"
                    onClick={() => setCanvasMovementEnabled(option.value)}
                    style={{
                      minHeight: 34,
                      padding: "6px 10px",
                      borderRadius: 8,
                      border: isSelected ? "1px solid rgba(110,170,255,0.34)" : "1px solid rgba(255,255,255,0.12)",
                      background: isSelected ? "rgba(110,170,255,0.10)" : "rgba(255,255,255,0.04)",
                      color: isSelected ? "rgba(225,238,255,0.92)" : "rgba(255,255,255,0.82)",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
            <button
              type="button"
              onClick={clearCanvasContent}
              style={{
                width: 168,
                padding: "9px 12px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.86)",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Clear Canvas
            </button>
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: 8, color: "rgba(255,255,255,0.76)", fontSize: 12 }}>
            Background Color
            <input
              type="color"
              value={canvasBackgroundColor}
              onChange={(e) => setCanvasBackgroundColor(e.target.value)}
              style={{ width: 48, height: 32, padding: 0, border: "none", background: "transparent", cursor: "pointer" }}
            />
          </label>
        </div>

        {activePlacedImageAsset && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ color: "rgba(255,255,255,0.74)", fontSize: 11 }}>Placed asset</div>
            <div style={{ color: "rgba(255,255,255,0.62)", fontSize: 12, lineHeight: 1.4 }}>
              Drag inside the asset to move it, use the edge and corner handles to resize it, and drag the round
              handle at the lower-right to rotate it.
            </div>
            <RotationValueField
              value={activePlacedImageAsset.rotation}
              onCommit={(rotation) => {
                setActivePlacedImageAsset((current) => (current ? { ...current, rotation } : current));
              }}
            />
            <button
              type="button"
              onClick={commitPlacedImageAssetToCanvas}
              style={{
                width: "100%",
                minHeight: 34,
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.86)",
                fontSize: 12,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              Commit Placement
            </button>
          </div>
        )}

        {activeBoxSelection && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ color: "rgba(255,255,255,0.74)", fontSize: 11 }}>Selection actions</div>
            {activeBoxSelection.kind === "bitmap" && (
              <RotationValueField
                value={activeBoxSelection.rotation}
                onCommit={(rotation) => {
                  updateActiveBoxSelectionState((current) =>
                    current?.kind === "bitmap" ? { ...current, rotation } : current,
                  );
                }}
              />
            )}
            <button
              type="button"
              onClick={duplicateBoxSelection}
              style={{
                width: "100%",
                minHeight: 40,
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.86)",
                fontSize: 12,
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                flexDirection: "column",
                gap: 1,
                alignItems: "flex-start",
              }}
            >
              Duplicate
              <span style={{ color: "rgba(255,255,255,0.58)", fontSize: 9, fontWeight: 500, lineHeight: 1.2 }}>
                Create a copy of the selected artwork region.
              </span>
            </button>
            <button
              type="button"
              onClick={deleteBoxSelection}
              style={{
                width: "100%",
                minHeight: 40,
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.86)",
                fontSize: 12,
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                flexDirection: "column",
                gap: 1,
                alignItems: "flex-start",
              }}
            >
              Delete
              <span style={{ color: "rgba(255,255,255,0.58)", fontSize: 9, fontWeight: 500, lineHeight: 1.2 }}>
                Remove the selected artwork region from the canvas.
              </span>
            </button>
            <button
              type="button"
              onClick={() => flipBoxSelection("x")}
              style={{
                width: "100%",
                minHeight: 34,
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.86)",
                fontSize: 12,
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                flexDirection: "column",
                gap: 1,
                alignItems: "flex-start",
              }}
            >
              Flip X
              <span style={{ color: "rgba(255,255,255,0.58)", fontSize: 9, fontWeight: 500, lineHeight: 1.2 }}>
                Mirror the current selection horizontally.
              </span>
            </button>
            <button
              type="button"
              onClick={() => flipBoxSelection("y")}
              style={{
                width: "100%",
                minHeight: 34,
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.86)",
                fontSize: 12,
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                flexDirection: "column",
                gap: 1,
                alignItems: "flex-start",
              }}
            >
              Flip Y
              <span style={{ color: "rgba(255,255,255,0.58)", fontSize: 9, fontWeight: 500, lineHeight: 1.2 }}>
                Mirror the current selection vertically.
              </span>
            </button>
            <button
              type="button"
              onClick={convertBoxSelectionToSymbol}
              style={{
                width: "100%",
                minHeight: 34,
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.86)",
                fontSize: 12,
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                flexDirection: "column",
                gap: 1,
                alignItems: "flex-start",
              }}
            >
              Convert to Symbol
              <span style={{ color: "rgba(255,255,255,0.58)", fontSize: 9, fontWeight: 500, lineHeight: 1.2 }}>
                Turn this selected region into a reusable library symbol.
              </span>
            </button>
            <button
              type="button"
              onClick={activeBoxSelection?.kind === "text" ? clearTextSelectionState : deselectBoxSelection}
              style={{
                width: "100%",
                minHeight: 40,
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.86)",
                fontSize: 12,
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                flexDirection: "column",
                gap: 1,
                alignItems: "flex-start",
              }}
            >
              Deselect
              <span style={{ color: "rgba(255,255,255,0.58)", fontSize: 9, fontWeight: 500, lineHeight: 1.2 }}>
                Clear the current box selection.
              </span>
            </button>
          </div>
        )}
        {activeBoxSelection?.kind === "text" && renderTextPropertiesEditor("Selected Text", "Select a text object to edit it.")}
      </div>
    ) : activeTool === "Brush" ? (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 0 }}>
        <div style={{ color: "rgba(255,255,255,0.88)", fontSize: 13, fontWeight: 700 }}>Tool: Brush</div>
        <label style={{ display: "flex", flexDirection: "column", gap: 5, color: "rgba(255,255,255,0.76)", fontSize: 12 }}>
          {brushToolVariant} size: {brushSize}
          <input
            type="range"
            min={1}
            max={24}
            step={1}
            value={brushSize}
            onChange={(e) => onBrushSizeChange(Number(e.target.value))}
            style={{ width: "100%" }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 5, color: "rgba(255,255,255,0.76)", fontSize: 12 }}>
          Transparency: {brushTransparency}
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={brushTransparency}
            onChange={(e) => setBrushTransparency(Number(e.target.value))}
            style={{ width: "100%" }}
          />
        </label>
        {brushToolVariant === "Glow" && (
          <label style={{ display: "flex", flexDirection: "column", gap: 5, color: "rgba(255,255,255,0.76)", fontSize: 12 }}>
            Gradient Brightness: {glowGradientBrightness}
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={glowGradientBrightness}
              onChange={(e) => setGlowGradientBrightness(Number(e.target.value))}
              style={{ width: "100%" }}
            />
          </label>
        )}
        {brushToolVariant === "Glow" && (
          <label style={{ display: "flex", flexDirection: "column", gap: 5, color: "rgba(255,255,255,0.76)", fontSize: 12 }}>
            Gradient Radius: {glowGradientRadius}
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={glowGradientRadius}
              onChange={(e) => setGlowGradientRadius(Number(e.target.value))}
              style={{ width: "100%" }}
            />
          </label>
        )}
        <label style={{ display: "flex", flexDirection: "column", gap: 5, color: "rgba(255,255,255,0.76)", fontSize: 12 }}>
          Smoothing: {brushSmoothing}
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={brushSmoothing}
            onChange={(e) => setBrushSmoothing(Number(e.target.value))}
            style={{ width: "100%" }}
          />
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, color: "rgba(255,255,255,0.76)", fontSize: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div>Color</div>
              <input
                type="color"
                value={brushColor}
                onChange={(e) => setBrushColor(e.target.value)}
                style={{ width: 28, height: 28, padding: 0, border: "none", background: "transparent", cursor: "pointer" }}
              />
            </div>
            <div style={{ color: "rgba(255,255,255,0.58)", fontSize: 11 }}>Choose the color your brush will paint with.</div>
          </div>
          <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 2 }}>
            <button
              ref={brushToolsButtonRef}
              type="button"
              onClick={() => setBrushToolsMenuOpen((open) => !open)}
              style={{
                width: "100%",
                minHeight: 44,
                padding: "11px 12px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.05)",
                color: "rgba(255,255,255,0.92)",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              Brush Tools: {brushToolVariant}
            </button>
          </div>
        </div>
      </div>
    ) : activeTool === "Eraser" ? (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ color: "rgba(255,255,255,0.88)", fontSize: 13, fontWeight: 700 }}>Tool: Eraser</div>
        <div style={{ color: "rgba(255,255,255,0.76)", fontSize: 12 }}>Mode: Erase</div>
        <label style={{ display: "flex", flexDirection: "column", gap: 8, color: "rgba(255,255,255,0.76)", fontSize: 12 }}>
          Eraser size: {eraserSize}
          <input
            type="range"
            min={1}
            max={24}
            step={1}
            value={eraserSize}
            onChange={(e) => onEraserSizeChange(Number(e.target.value))}
            style={{ width: "100%" }}
          />
        </label>
      </div>
    ) : activeTool === "Fill" ? (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ color: "rgba(255,255,255,0.88)", fontSize: 13, fontWeight: 700 }}>Tool: Fill</div>
        <label style={{ display: "flex", flexDirection: "column", gap: 8, color: "rgba(255,255,255,0.76)", fontSize: 12 }}>
          Fill color
          <input
            type="color"
            value={fillColor}
            onChange={(e) => onFillColorChange(e.target.value)}
            style={{ width: 48, height: 32, padding: 0, border: "none", background: "transparent", cursor: "pointer" }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 8, color: "rgba(255,255,255,0.76)", fontSize: 12 }}>
          Tolerance: {fillTolerance}
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={fillTolerance}
            onChange={(e) => setFillTolerance(Number(e.target.value))}
            style={{ width: "100%" }}
          />
          <div style={{ color: "rgba(255,255,255,0.58)", fontSize: 11 }}>
            Controls how similar colors must be to be filled. Low tolerance fills only very similar colors. High
            tolerance fills a wider range of colors.
          </div>
        </label>
      </div>
    ) : activeTool === "Text" ? (
      renderTextPropertiesEditor("Tool: Text", "Click the canvas to create a text object.")
    ) : activeTool === "Lasso" ? (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ color: "rgba(255,255,255,0.88)", fontSize: 13, fontWeight: 700 }}>Tool: Lasso</div>
        {!activeLassoSelection ? (
          <div style={{ color: "rgba(255,255,255,0.76)", fontSize: 12 }}>Draw around an area to select it.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ color: "rgba(255,255,255,0.74)", fontSize: 11 }}>Selection actions</div>
            {activeLassoSelection.kind === "bitmap" && (
              <RotationValueField
                value={activeLassoSelection.rotation}
                onCommit={(rotation) => {
                  updateActiveLassoSelectionState((current) =>
                    current?.kind === "bitmap" ? { ...current, rotation } : current,
                  );
                }}
              />
            )}
            <button
              type="button"
              onClick={duplicateLassoSelection}
              style={{
                width: "100%",
                minHeight: 40,
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.86)",
                fontSize: 12,
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                flexDirection: "column",
                gap: 1,
                alignItems: "flex-start",
              }}
            >
              Duplicate
              <span style={{ color: "rgba(255,255,255,0.58)", fontSize: 9, fontWeight: 500, lineHeight: 1.2 }}>
                Create a copy of the selected drawing.
              </span>
            </button>
            <button
              type="button"
              onClick={deleteLassoSelection}
              style={{
                width: "100%",
                minHeight: 40,
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.86)",
                fontSize: 12,
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                flexDirection: "column",
                gap: 1,
                alignItems: "flex-start",
              }}
            >
              Delete
              <span style={{ color: "rgba(255,255,255,0.58)", fontSize: 9, fontWeight: 500, lineHeight: 1.2 }}>
                Remove the selected drawing from the canvas.
              </span>
            </button>
            <button
              type="button"
              onClick={() => flipLassoSelection("x")}
              style={{
                width: "100%",
                minHeight: 34,
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.86)",
                fontSize: 12,
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                flexDirection: "column",
                gap: 1,
                alignItems: "flex-start",
              }}
            >
              Flip X
              <span style={{ color: "rgba(255,255,255,0.58)", fontSize: 9, fontWeight: 500, lineHeight: 1.2 }}>
                Mirror the lasso selection horizontally.
              </span>
            </button>
            <button
              type="button"
              onClick={() => flipLassoSelection("y")}
              style={{
                width: "100%",
                minHeight: 34,
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.86)",
                fontSize: 12,
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                flexDirection: "column",
                gap: 1,
                alignItems: "flex-start",
              }}
            >
              Flip Y
              <span style={{ color: "rgba(255,255,255,0.58)", fontSize: 9, fontWeight: 500, lineHeight: 1.2 }}>
                Mirror the lasso selection vertically.
              </span>
            </button>
            <button
              type="button"
              onClick={convertLassoSelectionToSymbol}
              style={{
                width: "100%",
                minHeight: 34,
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.86)",
                fontSize: 12,
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                flexDirection: "column",
                gap: 1,
                alignItems: "flex-start",
              }}
            >
              Convert to Symbol
              <span style={{ color: "rgba(255,255,255,0.58)", fontSize: 9, fontWeight: 500, lineHeight: 1.2 }}>
                Turn this selection into a symbol you can reuse in the library.
              </span>
            </button>
            <button
              type="button"
              onClick={deselectLassoSelection}
              style={{
                width: "100%",
                minHeight: 40,
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.86)",
                fontSize: 12,
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                flexDirection: "column",
                gap: 1,
                alignItems: "flex-start",
              }}
            >
              Deselect
              <span style={{ color: "rgba(255,255,255,0.58)", fontSize: 9, fontWeight: 500, lineHeight: 1.2 }}>
                Exit lasso selection without keeping it active.
              </span>
            </button>
          </div>
        )}
        {activeLassoSelection?.kind === "text" && renderTextPropertiesEditor("Selected Text", "Select a text object to edit it.")}
      </div>
    ) : activeTool === "Knife" ? (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ color: "rgba(255,255,255,0.88)", fontSize: 13, fontWeight: 700 }}>Tool: Knife</div>
        {activeKnifePieces.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ color: "rgba(255,255,255,0.74)", fontSize: 11 }}>Selection actions</div>
            <button
              type="button"
              onClick={duplicateKnifePieces}
              style={{
                width: "100%",
                minHeight: 40,
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.86)",
                fontSize: 12,
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                flexDirection: "column",
                gap: 1,
                alignItems: "flex-start",
              }}
            >
              Duplicate
              <span style={{ color: "rgba(255,255,255,0.58)", fontSize: 9, fontWeight: 500, lineHeight: 1.2 }}>
                Keep the cut pieces in place and make a new selected copy.
              </span>
            </button>
            <button
              type="button"
              onClick={deleteKnifePieces}
              style={{
                width: "100%",
                minHeight: 40,
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.86)",
                fontSize: 12,
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                flexDirection: "column",
                gap: 1,
                alignItems: "flex-start",
              }}
            >
              Delete
              <span style={{ color: "rgba(255,255,255,0.58)", fontSize: 9, fontWeight: 500, lineHeight: 1.2 }}>
                Remove only the currently selected cut pieces.
              </span>
            </button>
            <button
              type="button"
              onClick={() => flipKnifePieces("x")}
              style={{
                width: "100%",
                minHeight: 34,
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.86)",
                fontSize: 12,
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                flexDirection: "column",
                gap: 1,
                alignItems: "flex-start",
              }}
            >
              Flip X
              <span style={{ color: "rgba(255,255,255,0.58)", fontSize: 9, fontWeight: 500, lineHeight: 1.2 }}>
                Mirror the selected cut pieces horizontally.
              </span>
            </button>
            <button
              type="button"
              onClick={() => flipKnifePieces("y")}
              style={{
                width: "100%",
                minHeight: 34,
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.86)",
                fontSize: 12,
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                flexDirection: "column",
                gap: 1,
                alignItems: "flex-start",
              }}
            >
              Flip Y
              <span style={{ color: "rgba(255,255,255,0.58)", fontSize: 9, fontWeight: 500, lineHeight: 1.2 }}>
                Mirror the selected cut pieces vertically.
              </span>
            </button>
            <button
              type="button"
              onClick={convertKnifeSelectionToSymbol}
              style={{
                width: "100%",
                minHeight: 34,
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.86)",
                fontSize: 12,
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                flexDirection: "column",
                gap: 1,
                alignItems: "flex-start",
              }}
            >
              Convert to Symbol
              <span style={{ color: "rgba(255,255,255,0.58)", fontSize: 9, fontWeight: 500, lineHeight: 1.2 }}>
                Turn the selected cut pieces into a reusable symbol.
              </span>
            </button>
            <button
              type="button"
              onClick={deselectKnifePieces}
              style={{
                width: "100%",
                minHeight: 40,
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.86)",
                fontSize: 12,
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                flexDirection: "column",
                gap: 1,
                alignItems: "flex-start",
              }}
            >
              Deselect
              <span style={{ color: "rgba(255,255,255,0.58)", fontSize: 9, fontWeight: 500, lineHeight: 1.2 }}>
                Commit the current cut-piece placement and clear the selection.
              </span>
            </button>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ color: "rgba(255,255,255,0.76)", fontSize: 12 }}>Straight line</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {([
              { label: "Off", value: false },
              { label: "On", value: true },
            ] as const).map((option) => {
              const isSelected = knifeStraightLine === option.value;
              return (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => setKnifeStraightLine(option.value)}
                  style={{
                    minHeight: 34,
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: isSelected ? "1px solid rgba(110,170,255,0.34)" : "1px solid rgba(255,255,255,0.12)",
                    background: isSelected ? "rgba(110,170,255,0.10)" : "rgba(255,255,255,0.04)",
                    color: isSelected ? "rgba(225,238,255,0.92)" : "rgba(255,255,255,0.82)",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: 8, color: "rgba(255,255,255,0.76)", fontSize: 12 }}>
          Smoothing: {knifeSmoothing}
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={knifeSmoothing}
            onChange={(e) => setKnifeSmoothing(Number(e.target.value))}
            style={{ width: "100%" }}
          />
        </label>
      </div>
    ) : activeTool === "Shape" ? (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ color: "rgba(255,255,255,0.88)", fontSize: 13, fontWeight: 700 }}>Tool: Shape</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ color: "rgba(255,255,255,0.76)", fontSize: 12 }}>Shape type</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {SHAPE_TYPES.map((option) => {
              const isSelected = shapeType === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => onShapeTypeChange(option)}
                  style={{
                    minHeight: 34,
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: isSelected ? "1px solid rgba(110,170,255,0.34)" : "1px solid rgba(255,255,255,0.12)",
                    background: isSelected ? "rgba(110,170,255,0.10)" : "rgba(255,255,255,0.04)",
                    color: isSelected ? "rgba(225,238,255,0.92)" : "rgba(255,255,255,0.82)",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ color: "rgba(255,255,255,0.76)", fontSize: 12 }}>Mode</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(["Draw", "Cutout"] as const).map((option) => {
              const isSelected = shapeMode === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setShapeMode(option)}
                  style={{
                    minHeight: 34,
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: isSelected ? "1px solid rgba(110,170,255,0.34)" : "1px solid rgba(255,255,255,0.12)",
                    background: isSelected ? "rgba(110,170,255,0.10)" : "rgba(255,255,255,0.04)",
                    color: isSelected ? "rgba(225,238,255,0.92)" : "rgba(255,255,255,0.82)",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: 8, color: "rgba(255,255,255,0.76)", fontSize: 12 }}>
          Fill color
          <input
            type="color"
            value={shapeFillColor}
            onChange={(e) => setShapeFillColor(e.target.value)}
            style={{ width: 48, height: 32, padding: 0, border: "none", background: "transparent", cursor: "pointer" }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 8, color: "rgba(255,255,255,0.76)", fontSize: 12 }}>
          Outline color
          <input
            type="color"
            value={shapeOutlineColor}
            onChange={(e) => setShapeOutlineColor(e.target.value)}
            style={{ width: 48, height: 32, padding: 0, border: "none", background: "transparent", cursor: "pointer" }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 8, color: "rgba(255,255,255,0.76)", fontSize: 12 }}>
          Outline thickness: {shapeOutlineThickness}
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={shapeOutlineThickness}
            onChange={(e) => setShapeOutlineThickness(Number(e.target.value))}
            style={{ width: "100%" }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 8, color: "rgba(255,255,255,0.76)", fontSize: 12 }}>
                Corner curveness : {shapeCornerRadius}
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={shapeCornerRadius}
            onChange={(e) => setShapeCornerRadius(Number(e.target.value))}
            style={{ width: "100%" }}
          />
        </label>
      </div>
    ) : (
      <div style={{ color: "rgba(255,255,255,0.72)" }}>{activeTool} tool is not functional yet.</div>
    );

  const assetsTabContent = (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0, height: "100%" }}>
      <div style={{ color: "rgba(255,255,255,0.88)", fontSize: 13, fontWeight: 700 }}>Assets</div>
      <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 12 }}>
        Import external files and keep visual references available for this project.
      </div>
      <input ref={assetInputRef} type="file" multiple onChange={handleAssetImport} style={{ display: "none" }} />
      <button
        type="button"
        onClick={() => assetInputRef.current?.click()}
        style={{
          width: "fit-content",
          padding: "7px 10px",
          borderRadius: 8,
          border: "1px solid rgba(110,170,255,0.34)",
          background: "rgba(110,170,255,0.10)",
          color: "rgba(225,238,255,0.92)",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Import Asset
      </button>
      {importedAssets.length === 0 ? (
        <div
          style={{
            border: "1px dashed rgba(255,255,255,0.20)",
            borderRadius: 10,
            padding: "12px 10px",
            color: "rgba(255,255,255,0.64)",
            fontSize: 12,
          }}
        >
          No imported assets yet.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, alignContent: "start" }}>
          {importedAssets.map((asset) => (
            <div
              key={asset.id}
              draggable={asset.kind === "image" && !!asset.previewUrl}
              onDragStart={(e) => handleAssetDragStart(e, asset)}
              style={{
                border: "1px solid rgba(255,255,255,0.09)",
                borderRadius: 10,
                background: "rgba(255,255,255,0.02)",
                padding: 8,
                minHeight: 88,
                display: "flex",
                flexDirection: "column",
                gap: 8,
                cursor: asset.kind === "image" ? "grab" : "default",
              }}
            >
              {asset.previewUrl ? (
                <div
                  role="img"
                  aria-label={asset.name}
                  style={{
                    height: 72,
                    width: "100%",
                    borderRadius: 6,
                    border: "1px solid rgba(255,255,255,0.12)",
                    padding: 6,
                    background: "linear-gradient(180deg, rgba(12,16,22,0.96), rgba(24,29,38,0.96))",
                    backgroundImage: `url("${asset.previewUrl}")`,
                    backgroundPosition: "center",
                    backgroundRepeat: "no-repeat",
                    backgroundSize: "contain",
                    backgroundOrigin: "content-box",
                  }}
                />
              ) : (
                <div
                  aria-hidden="true"
                  style={{
                    height: 72,
                    borderRadius: 6,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background:
                      "linear-gradient(135deg, rgba(110,170,255,0.24), rgba(255,255,255,0.04) 55%, rgba(255,255,255,0.02))",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "rgba(255,255,255,0.62)",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 0.5,
                  }}
                >
                  FILE
                </div>
              )}
              <div style={{ color: "rgba(255,255,255,0.84)", fontSize: 11, fontWeight: 600, lineHeight: 1.25 }}>{asset.name}</div>
              <div style={{ color: "rgba(255,255,255,0.56)", fontSize: 10 }}>{asset.meta}</div>
              {asset.kind === "image" && (
                <div style={{ color: "rgba(255,255,255,0.44)", fontSize: 10 }}>{asset.sizeLabel}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const libraryTabContent = (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 0, height: "100%" }}>
      <div style={{ color: "rgba(255,255,255,0.88)", fontSize: 13, fontWeight: 700 }}>Library</div>
      <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 12 }}>
        Store reusable project-created symbols, poses, drawings, and effects.
      </div>
      {librarySymbols.length === 0 ? (
        <div
          style={{
            border: "1px dashed rgba(255,255,255,0.20)",
            borderRadius: 10,
            padding: "12px 10px",
            color: "rgba(255,255,255,0.64)",
            fontSize: 12,
          }}
        >
          No symbols created yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {librarySymbols.map((item) => (
            <div
              key={item.id}
              draggable
              onDragStart={(e) => handleLibrarySymbolDragStart(e, item)}
              style={{
                border: "1px solid rgba(255,255,255,0.09)",
                borderRadius: 10,
                background: "rgba(255,255,255,0.02)",
                padding: "8px 10px",
                display: "flex",
                alignItems: "center",
                gap: 9,
                cursor: "grab",
              }}
            >
              <div
                role="img"
                aria-label={item.name}
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 6,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "linear-gradient(180deg, rgba(12,16,22,0.96), rgba(24,29,38,0.96))",
                  backgroundImage: `url("${item.previewUrl}")`,
                  backgroundPosition: "center",
                  backgroundRepeat: "no-repeat",
                  backgroundSize: "contain",
                  flexShrink: 0,
                }}
              />
              <div style={{ minWidth: 0 }}>
                <div style={{ color: "rgba(255,255,255,0.84)", fontSize: 12, fontWeight: 600, lineHeight: 1.2 }}>{item.name}</div>
                <div style={{ color: "rgba(255,255,255,0.56)", fontSize: 10 }}>{item.tag}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const rightPanelContent =
    rightPanelTab === "Properties" ? propertiesTabContent : rightPanelTab === "Assets" ? assetsTabContent : libraryTabContent;

  return (
    <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
      <div style={{ flex: 1, minWidth: 0, padding: 14 }}>
        <div
          ref={canvasHostRef}
          onDragOver={handleCanvasDragOver}
          onDrop={handleCanvasDrop}
          style={{
            height: "100%",
            borderRadius: 0,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgb(34, 36, 47)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              left: `${((1 - AUTHORING_WORLD_SCALE) / 2) * 100}%`,
              top: `${((1 - AUTHORING_WORLD_SCALE) / 2) * 100}%`,
              width: `${AUTHORING_WORLD_SCALE * 100}%`,
              height: `${AUTHORING_WORLD_SCALE * 100}%`,
              transform: `translate(${cameraPan.x}px, ${cameraPan.y}px) scale(${cameraZoom})`,
              transformOrigin: "center center",
            }}
          >
            <div
              aria-hidden="true"
              data-workspace-stage-guide="camera"
              style={{
                position: "absolute",
                left: `${CAMERA_FRAME_INSET_PERCENT}%`,
                top: `${CAMERA_FRAME_INSET_PERCENT}%`,
                width: `${CAMERA_FRAME_SIZE_PERCENT}%`,
                height: `${CAMERA_FRAME_SIZE_PERCENT}%`,
                background: canvasBackgroundColor,
                boxShadow: "0 0 0 1px rgba(0,0,0,0.28), 0 16px 34px rgba(0,0,0,0.34)",
                pointerEvents: "none",
              }}
            />
            <canvas
              ref={backgroundCanvasRef}
              data-workspace-canvas="background"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
              }}
            />
            <canvas
              ref={onionCanvasRef}
              data-workspace-canvas="onion"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
              }}
            />
            <canvas
              ref={canvasRef}
              data-workspace-canvas="editable"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                touchAction: activeTool === "Select" ? "none" : "auto",
                cursor:
                  activeTool === "Brush" ||
                  activeTool === "Eraser" ||
                  activeTool === "Fill" ||
                  activeTool === "Text" ||
                  activeTool === "Lasso" ||
                  activeTool === "Knife" ||
                  activeTool === "Shape"
                    ? activeTool === "Text"
                      ? "text"
                      : "crosshair"
                    : undefined,
              }}
              onPointerDown={startCanvasStroke}
              onPointerMove={moveCanvasStroke}
              onPointerUp={endCanvasStroke}
              onPointerLeave={endCanvasStroke}
              onPointerCancel={endCanvasStroke}
            />
            <canvas
              ref={textCanvasRef}
              data-workspace-canvas="text"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
              }}
            />
            <canvas
              ref={foregroundCanvasRef}
              data-workspace-canvas="foreground"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
              }}
            />
            <canvas
              ref={lassoOverlayRef}
              data-workspace-canvas="overlay"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
              }}
            />
          </div>
          <canvas
            ref={playbackCanvasRef}
            data-workspace-canvas="playback"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
              opacity: isTimelinePlaying ? 1 : 0,
              transition: "opacity 120ms ease",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: activeTool === "Select" && canvasMovementEnabled && !activePlacedImageAsset ? "auto" : "none",
              cursor:
                activeTool === "Select" && canvasMovementEnabled && !activePlacedImageAsset
                  ? canvasMovementEnabled
                    ? isPanning
                      ? "grabbing"
                      : "grab"
                    : "default"
                  : "default",
            }}
            onPointerDown={startSelectPan}
            onPointerMove={moveSelectPan}
            onPointerUp={endSelectPan}
            onPointerCancel={endSelectPan}
            onWheel={zoomCanvas}
          />
        </div>
      </div>

      <DrawingRightPanel
        rightPanelRef={rightPanelRef}
        rightPanelTabsRef={rightPanelTabsRef}
        rightPanelTab={rightPanelTab}
        onRightPanelTabChange={setRightPanelTab}
        rightPanelContent={rightPanelContent}
        showBrushToolsMenu={brushToolsMenuOpen && rightPanelTab === "Properties" && activeTool === "Brush"}
        brushToolsMenuRef={brushToolsMenuRef}
        brushToolsMenuPosition={brushToolsMenuPosition}
        brushToolVariant={brushToolVariant}
        onBrushToolSelect={(option) => {
          setBrushToolVariant(option);
          setBrushToolsMenuOpen(false);
        }}
        workspaceContext={workspaceContext}
        projectAiMemory={projectAiMemory}
        onProjectAiMemoryChange={onProjectAiMemoryChange}
        onApplyGeneratedFrame={onApplyGeneratedFrame}
        onExecuteActionPlan={onExecuteActionPlan}
      />
    </div>
  );
});

DrawingCanvas.displayName = "DrawingCanvas";
