import { canonicalPaint, compositeRasterPaint, mergePaintPixel, rasterCommandDigest, RASTER_ALGORITHM_VERSION, RASTER_GESTURE_COMMAND, RasterGestureDraft, unionRect, type RasterGestureCommandV2, type RasterPreview, type RasterRect } from "@/src/lib/animation/editorCommands/rasterGesture";
import { attachBitmapPaintCoverage, compositeRasterSelectionV1, cropPaintCoverage, copyBitmapPaintCoverage, forEachPaintCoverage, getBitmapPaintCoverage, createPaintCoverageWriter, getPaintCoverage, patchPaintCoverage, remapSketchOwners, resolveSketchKnifeOwner, transformPaintCoverage, type UnifiedRasterPaintCoverageV1 } from "@/src/lib/animation/unifiedRasterPaintCoverageV1";
import { authorizeDestructiveCommand } from "@/src/lib/animation/editorCommands/destructiveRegistry";
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
import type { StickFigureFrameContent, StickFigurePoint } from "./stickfigure/types";
import type {
  UnifiedBitmapSymbolDefinitionV2,
  UnifiedProjectAssetV2,
  UnifiedStructuredSymbolPayloadV2,
} from "@/src/lib/animation/unifiedAnimationContractV2";
import type {
  UnifiedSymbolInstanceItemV2,
  UnifiedSymbolSourceCategoryV2,
} from "@/src/lib/animation/unifiedAnimationContentV2";
import {
  classifyUnifiedSymbolSourceV2,
  createProjectAssetV2,
  resolveStructuredSymbolGeometryV2,
} from "@/src/lib/animation/unifiedProjectCatalogV2";
import {
  authoredStagePoint,
  bitmapCenterOffset,
  fitAuthoredStage,
  presentStagePoint,
} from "@/src/lib/animation/unifiedStageGeometry";

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

const drawStructuredSymbolGeometry = (
  ctx: CanvasRenderingContext2D,
  geometry: ReturnType<typeof resolveStructuredSymbolGeometryV2>,
  strokeScale = 1,
) => {
  if (!geometry) return;
  ctx.strokeStyle = "#101218";
  ctx.fillStyle = "#101218";
  ctx.lineWidth = 14 * strokeScale;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const limb of geometry.limbs) {
    ctx.beginPath(); ctx.moveTo(limb.start.x, limb.start.y); ctx.lineTo(limb.end.x, limb.end.y); ctx.stroke();
  }
  for (const joint of geometry.joints) {
    ctx.beginPath(); ctx.arc(joint.x, joint.y, 14 * strokeScale, 0, Math.PI * 2); ctx.fill();
  }
};
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
  sourceCanvas: HTMLCanvasElement | null;
  allowRotation: boolean;
};

type StructuredStickSelection = {
  sourceContent: StickFigureFrameContent;
  jointIds: string[];
  limbIds: string[];
  originBounds: RectBounds;
};

type BitmapSelectionSession = {
  owner: BitmapSelectionOwner;
  items: BitmapSelectionSessionItem[];
  structuredStick?: StructuredStickSelection | null;
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
  symbolDefinitionId?: string;
  symbolDefinitionDigest?: string;
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

type UnifiedSymbolInteractionState = {
  pointerId: number;
  itemId: string;
  startPointer: StickFigurePoint;
  startX: number;
  startY: number;
  initial: UnifiedSymbolInstanceItemV2;
  handle?: ResizeHandle;
};

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
  tag: UnifiedSymbolSourceCategoryV2 | "symbol";
  previewUrl: string;
  width: number;
  height: number;
  signature: string;
  definitionDigest?: string;
};

type UnifiedSymbolSourceRemoval = {
  drawingChanged: boolean;
  stickContent: StickFigureFrameContent | null;
  textObjects: DrawingTextObject[] | null;
};

type PendingSymbolCreation = {
  sourceCanvas: HTMLCanvasElement;
  displaySize: { width: number; height: number };
  sourceCategory: UnifiedSymbolSourceCategoryV2;
  sourceRemoval: UnifiedSymbolSourceRemoval | null;
  structuredPayload?: UnifiedStructuredSymbolPayloadV2;
  prepareUnifiedCommit?: () => void;
  restoreAfterFailedUnifiedCommit?: () => void;
  resolve: (didCreate: boolean) => void;
};

type SymbolDialogState = {
  suggestedName: string;
  name: string;
  error: string | null;
  submitting: boolean;
};

type DrawingCanvasProps = {
  authoringContextKey?: string;
  activeTool: DrawingToolName;
  drawingToolActivationId?: number;
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
  onAuthoringActionCommitted?: (reason: "stroke" | "fill" | "shape" | "placed-asset" | "clear-canvas" | "knife" | "selection", command?: RasterGestureCommandV2) => boolean | void;
  onUnifiedSelectionActionCommitted?: (action: {
    drawingChanged: boolean;
    stickContent: StickFigureFrameContent | null;
  }) => boolean;
  onOpenStickFigureCreator: () => void;
  unifiedStickContent?: StickFigureFrameContent;
  onUnifiedStickContentChange?: (content: StickFigureFrameContent) => void;
  unifiedSymbolDefinitions?: UnifiedBitmapSymbolDefinitionV2[];
  unifiedProjectAssets?: UnifiedProjectAssetV2[];
  unifiedSymbolInstances?: UnifiedSymbolInstanceItemV2[];
  onCreateUnifiedSymbolDefinition?: (draft: {
    name: string;
    sourceCategory: UnifiedSymbolSourceCategoryV2;
    width: number;
    height: number;
    pngDataUrl: string;
    structuredPayload?: UnifiedStructuredSymbolPayloadV2;
  }, sourceRemoval: UnifiedSymbolSourceRemoval | null) => Promise<boolean>;
  onUnifiedAssetsImported?: (assets: UnifiedProjectAssetV2[]) => boolean;
  onRemoveUnifiedSymbolDefinition?: (definitionId: string) => boolean;
  onUnifiedSymbolInstancesChange?: (instances: UnifiedSymbolInstanceItemV2[]) => boolean;
};

export type DrawingCanvasSnapshot = {
  bitmap: ImageData | null;
  previewUrl: string | null | undefined;
  captureVersion?: number;
  identity?: { generation: number; contextKey: string };
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

type OnionOverlayContent = {
  previousBitmap: ImageData | null;
  nextBitmap: ImageData | null;
  previousTextObjects: DrawingTextObject[];
  nextTextObjects: DrawingTextObject[];
  previousStickContent: StickFigureFrameContent | null;
  nextStickContent: StickFigureFrameContent | null;
  previousSymbolInstances: UnifiedSymbolInstanceItemV2[];
  nextSymbolInstances: UnifiedSymbolInstanceItemV2[];
};

export type DrawingCanvasHandle = {
  cancelPendingAuthoringGesture: (reason: string) => void;
  getAuthoringSnapshotIdentity: () => { generation: number; contextKey: string };
  captureAuthoringSnapshot: (options?: DrawingCanvasSnapshotOptions) => DrawingCanvasSnapshot | null;
  clearTransientEditingState: () => void;
  getPlaybackSurfaceLayout: () => DrawingCanvasPlaybackSurfaceLayout | null;
  hasActiveBitmapSelectionSession: () => boolean;
  hasPendingAuthoringChanges: () => boolean;
  markAuthoringChangesCommitted: (committedBitmap?: ImageData | null, captureVersion?: number | null) => void;
  takePresentedRasterCommit: (bitmap: ImageData | null) => boolean;
  setOnionOverlayContent: (content: OnionOverlayContent) => void;
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

const rectContainsPoint = (rect: RectBounds, point: StickFigurePoint) =>
  point.x >= rect.x &&
  point.x <= rect.x + rect.width &&
  point.y >= rect.y &&
  point.y <= rect.y + rect.height;

const pointInPolygon = (point: StickFigurePoint, polygon: StickFigurePoint[]) => {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
    const currentPoint = polygon[current];
    const previousPoint = polygon[previous];
    const crosses =
      (currentPoint.y > point.y) !== (previousPoint.y > point.y) &&
      point.x <
        ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
          (previousPoint.y - currentPoint.y || Number.EPSILON) +
          currentPoint.x;
    if (crosses) inside = !inside;
  }
  return inside;
};

const segmentOrientation = (a: StickFigurePoint, b: StickFigurePoint, c: StickFigurePoint) =>
  (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);

const pointOnSegment = (a: StickFigurePoint, b: StickFigurePoint, point: StickFigurePoint) =>
  point.x >= Math.min(a.x, b.x) - 0.001 &&
  point.x <= Math.max(a.x, b.x) + 0.001 &&
  point.y >= Math.min(a.y, b.y) - 0.001 &&
  point.y <= Math.max(a.y, b.y) + 0.001;

const segmentsIntersect = (
  aStart: StickFigurePoint,
  aEnd: StickFigurePoint,
  bStart: StickFigurePoint,
  bEnd: StickFigurePoint,
) => {
  const o1 = segmentOrientation(aStart, aEnd, bStart);
  const o2 = segmentOrientation(aStart, aEnd, bEnd);
  const o3 = segmentOrientation(bStart, bEnd, aStart);
  const o4 = segmentOrientation(bStart, bEnd, aEnd);
  if ((o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0)) return true;
  if (Math.abs(o1) < 0.001 && pointOnSegment(aStart, aEnd, bStart)) return true;
  if (Math.abs(o2) < 0.001 && pointOnSegment(aStart, aEnd, bEnd)) return true;
  if (Math.abs(o3) < 0.001 && pointOnSegment(bStart, bEnd, aStart)) return true;
  if (Math.abs(o4) < 0.001 && pointOnSegment(bStart, bEnd, aEnd)) return true;
  return false;
};

const segmentIntersectsRect = (start: StickFigurePoint, end: StickFigurePoint, rect: RectBounds) => {
  if (rectContainsPoint(rect, start) || rectContainsPoint(rect, end)) return true;
  const topLeft = { x: rect.x, y: rect.y };
  const topRight = { x: rect.x + rect.width, y: rect.y };
  const bottomRight = { x: rect.x + rect.width, y: rect.y + rect.height };
  const bottomLeft = { x: rect.x, y: rect.y + rect.height };
  return (
    segmentsIntersect(start, end, topLeft, topRight) ||
    segmentsIntersect(start, end, topRight, bottomRight) ||
    segmentsIntersect(start, end, bottomRight, bottomLeft) ||
    segmentsIntersect(start, end, bottomLeft, topLeft)
  );
};

const segmentIntersectsPolygon = (
  start: StickFigurePoint,
  end: StickFigurePoint,
  polygon: StickFigurePoint[],
) => {
  if (pointInPolygon(start, polygon) || pointInPolygon(end, polygon)) return true;
  return polygon.some((point, index) =>
    segmentsIntersect(start, end, point, polygon[(index + 1) % polygon.length]),
  );
};

const unionRectBounds = (first: RectBounds, second: RectBounds): RectBounds => {
  const x = Math.min(first.x, second.x);
  const y = Math.min(first.y, second.y);
  const right = Math.max(first.x + first.width, second.x + second.width);
  const bottom = Math.max(first.y + first.height, second.y + second.height);
  return { x, y, width: right - x, height: bottom - y };
};

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
  authoringContextKey = "",
  drawingToolActivationId = 0,
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
  onUnifiedSelectionActionCommitted,
  onOpenStickFigureCreator,
  unifiedStickContent = { figures: [], structureGraph: { joints: [], limbs: [], activeJointId: null } },
  onUnifiedStickContentChange,
  unifiedSymbolDefinitions,
  unifiedProjectAssets,
  unifiedSymbolInstances = [],
  onCreateUnifiedSymbolDefinition,
  onUnifiedAssetsImported,
  onRemoveUnifiedSymbolDefinition,
  onUnifiedSymbolInstancesChange,
}: DrawingCanvasProps, ref) {
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
  const onionOverlayContentRef = useRef<OnionOverlayContent>({
    previousBitmap: null,
    nextBitmap: null,
    previousTextObjects: EMPTY_ONION_TEXT_OBJECTS,
    nextTextObjects: EMPTY_ONION_TEXT_OBJECTS,
    previousStickContent: null,
    nextStickContent: null,
    previousSymbolInstances: [],
    nextSymbolInstances: [],
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
  const pendingSymbolCreationRef = useRef<PendingSymbolCreation | null>(null);
  const symbolNameInputRef = useRef<HTMLInputElement | null>(null);
  const isDrawingRef = useRef(false);
  const isShapeDrawingRef = useRef(false);
  const shapeDraftRef = useRef<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
  const shapeDraftBaseImageRef = useRef<ImageData | null>(null);
  const preparedRasterCommandRef = useRef<RasterGestureCommandV2 | null>(null);
  const lassoInteractionRef = useRef<LassoInteractionState | null>(null);
  const selectionSourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lassoPathRef = useRef<LassoPoint[]>([]);
  const symbolCaptureLassoPathRef = useRef<LassoPoint[] | null>(null);
  const activeLassoSelectionRef = useRef<ActiveLassoSelection | null>(null);
  const textInteractionRef = useRef<TextInteractionState>(null);
  const selectedTextObjectIdRef = useRef<string | null>(null);
  const textDraftObjectsRef = useRef<DrawingTextObject[] | null>(null);
  const knifeInteractionRef = useRef<KnifeInteractionState | null>(null);
  const activeKnifePieceIdRef = useRef<string | null>(null);
  const knifePiecesSourceRef = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const knifePiecesRef = useRef<ActiveKnifePiece[]>([]);
  const knifePathRef = useRef<LassoPoint[]>([]);
  const shapePreviewFrameRef = useRef<number | null>(null);
  const isPanningRef = useRef(false);
  const hasPendingAuthoringChangesRef = useRef(false);
  const commitPendingAuthoringChangesRef = useRef(onAuthoringActionCommitted);
  commitPendingAuthoringChangesRef.current = onAuthoringActionCommitted;
  const authoringCommittedBitmapRef = useRef<ImageData | null>(null);
  const preparedFillSnapshotRef = useRef<ImageData | null>(null);
  const presentedRasterCommitRef = useRef<{ bitmap: ImageData | null; contextKey: string; generation: number; width: number; height: number } | null>(null);
  const rasterDraftRef = useRef<{
    engine: RasterGestureDraft; pointerId: number; contextKey: string; generation: number; erase: boolean; ownerId?: string;
    baseCoverage: UnifiedRasterPaintCoverageV1 | null;
    writer: ReturnType<typeof createPaintCoverageWriter>;
    candidateWriter: ReturnType<typeof createPaintCoverageWriter>;
    baseWriter: ReturnType<typeof createPaintCoverageWriter>;
    tiles: Map<string, { left: number; top: number; base: ImageData; display: ImageData; basePixels: ReturnType<typeof getPaintCoverage>[]; presentedCoverage: Uint8Array; presentedLight: Uint8Array }>;
    dirty: RasterRect | null;
    presented: RasterPreview | null;
  } | null>(null);
  const currentRasterContextRef = useRef(authoringContextKey);
  currentRasterContextRef.current = authoringContextKey;
  const cancelRasterDraftRef = useRef<(reason: string) => void>(() => {});

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
  const [canvasInteractionOwner, setCanvasInteractionOwner] = useState<"drawing" | "stick">("drawing");
  const [unifiedStickMode, setUnifiedStickMode] = useState<"select" | "add-limb">("select");
  const [unifiedSelectedJointId, setUnifiedSelectedJointId] = useState<string | null>(null);
  type UnifiedStickDrag = {
    pointerId: number;
    startPoint: StickFigurePoint;
    currentPoint: StickFigurePoint;
    startJointId: string | null;
    movingJointId: string | null;
    jointOffset: StickFigurePoint;
    contextKey: string;
    mode: "select" | "add-limb";
    sourceContent: StickFigureFrameContent;
  };
  const [unifiedStickDrag, setUnifiedStickDrag] = useState<UnifiedStickDrag | null>(null);
  const unifiedStickDragRef = useRef<UnifiedStickDrag | null>(null);
  const publishUnifiedStickDrag = useCallback((draft: UnifiedStickDrag | null) => {
    unifiedStickDragRef.current = draft;
    setUnifiedStickDrag(draft);
  }, []);
  const unifiedStickSvgRef = useRef<SVGSVGElement | null>(null);
  const unifiedSymbolInteractionRef = useRef<UnifiedSymbolInteractionState | null>(null);
  const [selectedUnifiedSymbolInstanceId, setSelectedUnifiedSymbolInstanceId] = useState<string | null>(null);
  const [draftUnifiedSymbolInstance, setDraftUnifiedSymbolInstance] = useState<UnifiedSymbolInstanceItemV2 | null>(null);
  const draftUnifiedSymbolInstanceRef = useRef<UnifiedSymbolInstanceItemV2 | null>(null);
  const publishUnifiedSymbolDraft = useCallback((draft: UnifiedSymbolInstanceItemV2 | null) => {
    draftUnifiedSymbolInstanceRef.current = draft;
    setDraftUnifiedSymbolInstance(draft);
  }, []);
  const clearUnifiedSymbolSelection = useCallback(() => {
    unifiedSymbolInteractionRef.current = null;
    publishUnifiedSymbolDraft(null);
    setSelectedUnifiedSymbolInstanceId(null);
  }, [publishUnifiedSymbolDraft]);
  const [importedAssets, setImportedAssets] = useState<ImportedAsset[]>([]);
  const [librarySymbols, setLibrarySymbols] = useState<LibrarySymbol[]>([]);
  const [symbolDialog, setSymbolDialog] = useState<SymbolDialogState | null>(null);
  const [workspaceNotice, setWorkspaceNotice] = useState<string | null>(null);
  const [activePlacedImageAsset, setActivePlacedImageAsset] = useState<ActivePlacedImageAsset | null>(null);
  const [activeBitmapSelectionSession, setActiveBitmapSelectionSession] = useState<BitmapSelectionSession | null>(null);
  const [selectionBoxDraft, setSelectionBoxDraft] = useState<SelectionBoxDraft | null>(null);
  const [activeBoxSelection, setActiveBoxSelection] = useState<ActiveBoxSelection | null>(null);
  const [fillTolerance, setFillTolerance] = useState(20);
  const [brushTransparency, setBrushTransparency] = useState(0);
  const [brushSmoothing, setBrushSmoothing] = useState(0);
  const [drawRigEnabled, setDrawRigEnabled] = useState(false);
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
  const [authoringSurfaceVersion, setAuthoringSurfaceVersion] = useState(0);

  const invalidateAuthoringMetrics = useCallback(() => {
    authoringMetricsRef.current = null;
  }, []);

  const getCanvasHostContentRect = useCallback((host: HTMLDivElement) => {
    const borderRect = host.getBoundingClientRect();
    const style = window.getComputedStyle(host);
    const borderLeft = Number.parseFloat(style.borderLeftWidth) || 0;
    const borderRight = Number.parseFloat(style.borderRightWidth) || 0;
    const borderTop = Number.parseFloat(style.borderTopWidth) || 0;
    const borderBottom = Number.parseFloat(style.borderBottomWidth) || 0;
    return new DOMRect(
      borderRect.left + borderLeft,
      borderRect.top + borderTop,
      Math.max(0, borderRect.width - borderLeft - borderRight),
      Math.max(0, borderRect.height - borderTop - borderBottom),
    );
  }, []);

  const setOnionOverlayContent = useCallback((content: OnionOverlayContent) => {
    const current = onionOverlayContentRef.current;
    if (
      current.previousBitmap === content.previousBitmap &&
      current.nextBitmap === content.nextBitmap &&
      current.previousTextObjects === content.previousTextObjects &&
      current.nextTextObjects === content.nextTextObjects &&
      current.previousStickContent === content.previousStickContent &&
      current.nextStickContent === content.nextStickContent &&
      current.previousSymbolInstances === content.previousSymbolInstances &&
      current.nextSymbolInstances === content.nextSymbolInstances
    ) {
      return;
    }

    onionOverlayContentRef.current = content;
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
      const rect = getCanvasHostContentRect(host);
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.floor(rect.width * AUTHORING_WORLD_SCALE * dpr));
      const height = Math.max(1, Math.floor(rect.height * AUTHORING_WORLD_SCALE * dpr));
      invalidateAuthoringMetrics();

      const editableSizeChanged = canvas.width !== width || canvas.height !== height;
      if (!editableSizeChanged && backgroundCanvas.width === width && backgroundCanvas.height === height) return;
      if (editableSizeChanged) cancelRasterDraftRef.current?.("viewport-change");
      const preservedEditableCanvas = editableSizeChanged ? document.createElement("canvas") : null;
      let preservedCoverage = getBitmapPaintCoverage(canvas);
      try {
        if (editableSizeChanged && hasPendingAuthoringChangesRef.current) {
          commitPendingAuthoringChangesRef.current?.("selection");
          if (hasPendingAuthoringChangesRef.current) throw new Error("pending_snapshot_failed");
        }
        if (preservedEditableCanvas) {
          preservedEditableCanvas.width = width;
          preservedEditableCanvas.height = height;
          const preservedCtx = preservedEditableCanvas.getContext("2d");
          if (!preservedCtx || !canvas.getContext("2d")) throw new Error("resize_surface_unavailable");
          const committed = authoringCommittedBitmapRef.current;
          preservedCoverage = null;
          if (committed) {
            const left = bitmapCenterOffset(width, committed.width), top = bitmapCenterOffset(height, committed.height);
            preservedCtx.putImageData(committed, left, top);
            preservedCoverage = cropPaintCoverage(getBitmapPaintCoverage(committed), -left, -top, width, height);
          }
          // Floating selections own a cut-out presentation. Keep that area,
          // while restoring newly exposed pixels from the full stored bitmap.
          if (!committed || bitmapSelectionSessionRef.current?.items.length) {
            const left = bitmapCenterOffset(width, canvas.width), top = bitmapCenterOffset(height, canvas.height);
            const x = Math.max(0, left), y = Math.max(0, top);
            const w = Math.min(width, left + canvas.width) - x, h = Math.min(height, top + canvas.height) - y;
            if (w > 0 && h > 0) {
              preservedCtx.clearRect(x, y, w, h);
              preservedCtx.drawImage(canvas, left, top);
              preservedCoverage = patchPaintCoverage(preservedCoverage,
                cropPaintCoverage(getBitmapPaintCoverage(canvas), x - left, y - top, w, h), x, y, w, h, width, height);
            }
          }
        }
      } catch (error) {
        window.alert(`The canvas could not be resized. Your drawing is preserved. ${error instanceof Error ? error.message : ""}`);
        return;
      }

      for (const targetCanvas of [backgroundCanvas, onionCanvas, canvas, textCanvas, foregroundCanvas, overlayCanvas]) {
        const targetCtx =
          targetCanvas === canvas
            ? targetCanvas.getContext("2d", { desynchronized: true }) ?? targetCanvas.getContext("2d")
            : targetCanvas.getContext("2d");
        if (!targetCtx) continue;

        if (targetCanvas.width !== width) targetCanvas.width = width;
        if (targetCanvas.height !== height) targetCanvas.height = height;
        // The same exact backing-store / authoring-world ratio is used by
        // pointer mapping, paint, and dirty-patch capture (including rounding).
        targetCtx.setTransform(width / (rect.width * AUTHORING_WORLD_SCALE), 0, 0,
          height / (rect.height * AUTHORING_WORLD_SCALE), 0, 0);
        targetCtx.lineCap = "round";
        targetCtx.lineJoin = "round";
        targetCtx.strokeStyle = "#000000";
      }

      if (preservedEditableCanvas) {
        const canvasCtx = canvas.getContext("2d", { desynchronized: true }) ?? canvas.getContext("2d");
        if (canvasCtx) {
          canvasCtx.save();
          canvasCtx.setTransform(1, 0, 0, 1, 0, 0);
          canvasCtx.drawImage(preservedEditableCanvas, 0, 0);
          canvasCtx.restore();
        }
        attachBitmapPaintCoverage(canvas, preservedCoverage);
      }
      authoringDirtyRectRef.current = null;
      authoringDirtyCaptureModeRef.current = "region";
      setAuthoringSurfaceVersion(version => version + 1);
    };

    resizeAuthoringCanvases();
    const observer = new ResizeObserver(resizeAuthoringCanvases);
    observer.observe(host);
    window.addEventListener("resize", resizeAuthoringCanvases);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resizeAuthoringCanvases);
    };
  }, [AUTHORING_WORLD_SCALE, getCanvasHostContentRect, invalidateAuthoringMetrics]);

  useEffect(() => {
    const host = canvasHostRef.current;
    const playbackCanvas = playbackCanvasRef.current;
    if (!host || !playbackCanvas) return;

    const resizePlaybackCanvas = () => {
      const rect = getCanvasHostContentRect(host);
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
  }, [getCanvasHostContentRect, playbackRenderScale]);

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

    const hostRect = getCanvasHostContentRect(host);
    const cachedMetrics = authoringMetricsRef.current;
    if (
      cachedMetrics &&
      cachedMetrics.canvasWidth === canvas.width &&
      cachedMetrics.canvasHeight === canvas.height &&
      cachedMetrics.hostRect.left === hostRect.left &&
      cachedMetrics.hostRect.top === hostRect.top &&
      cachedMetrics.hostRect.width === hostRect.width &&
      cachedMetrics.hostRect.height === hostRect.height
    ) {
      return cachedMetrics;
    }
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
  }, [AUTHORING_WORLD_SCALE, getCanvasHostContentRect]);

  const getUnifiedStagePresentation = useCallback(() => {
    const metrics = getAuthoringMetrics();
    if (!metrics) return null;
    const fitted = fitAuthoredStage(metrics.hostRect.width, metrics.hostRect.height);
    if (!fitted) return null;
    return {
      metrics,
      presentation: {
        scale: fitted.scale,
        offsetX: metrics.stageOffsetX + fitted.offsetX,
        offsetY: metrics.stageOffsetY + fitted.offsetY,
      },
    };
  }, [getAuthoringMetrics]);

  const getPlaybackSurfaceLayout = useCallback((): DrawingCanvasPlaybackSurfaceLayout | null => {
    const host = canvasHostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) {
      return null;
    }

    const hostRect = getCanvasHostContentRect(host);
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
  }, [AUTHORING_WORLD_SCALE, getCanvasHostContentRect]);

  const clampPan = (pan: { x: number; y: number }, zoom: number) => {
    const host = canvasHostRef.current;
    if (!host) return pan;
    const rect = getCanvasHostContentRect(host);
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
    if (!unifiedProjectAssets) return;
    const nextAssets = unifiedProjectAssets.map(asset => ({
      id: asset.assetId,
      name: asset.name,
      kind: asset.kind,
      sizeLabel: formatAssetSize(asset.byteLength),
      meta: asset.kind === "image" && asset.width && asset.height
        ? `image • ${asset.width}x${asset.height}`
        : `file • ${formatAssetSize(asset.byteLength)}`,
      previewUrl: asset.dataUrl,
      width: asset.width,
      height: asset.height,
    } satisfies ImportedAsset));
    importedAssetsRef.current = nextAssets;
    setImportedAssets(nextAssets);
  }, [unifiedProjectAssets]);

  useEffect(() => {
    librarySymbolsRef.current = librarySymbols;
  }, [librarySymbols]);

  useEffect(() => {
    if (!unifiedSymbolDefinitions) return;
    const nextSymbols = unifiedSymbolDefinitions.map(definition => ({
      id: definition.definitionId,
      name: definition.name,
      tag: definition.sourceCategory,
      previewUrl: definition.pngDataUrl,
      width: definition.width,
      height: definition.height,
      signature: definition.assetSha256,
      definitionDigest: definition.definitionDigest,
    } satisfies LibrarySymbol));
    librarySymbolsRef.current = nextSymbols;
    setLibrarySymbols(nextSymbols);
  }, [unifiedSymbolDefinitions]);

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
        session.items.flatMap((item, index) =>
          item.sourceCanvas ? [[nextKnifePieces[index].id, item.sourceCanvas] as const] : [],
        ),
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
    const tabs = rightPanelTabsRef.current;
    if (!tabs) return;
    tabs.style.overflowX = "auto";
    tabs.style.overscrollBehaviorX = "contain";
    tabs.style.scrollbarWidth = "thin";
    tabs.setAttribute("aria-label", "Workspace panels");
  }, []);

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

  const clearTransientEditingState = useCallback(() => {
    cancelRasterDraftRef.current("clear-transient");
    const stickDraft = unifiedStickDragRef.current;
    publishUnifiedStickDrag(null);
    if (stickDraft && unifiedStickSvgRef.current?.hasPointerCapture(stickDraft.pointerId)) {
      unifiedStickSvgRef.current.releasePointerCapture(stickDraft.pointerId);
    }
    // History restoration cancels drafts but preserves the selected symbol's
    // own Properties workflow. Tool/context boundaries clear selection below.
    unifiedSymbolInteractionRef.current = null;
    publishUnifiedSymbolDraft(null);
    if (shapePreviewFrameRef.current !== null) {
      window.cancelAnimationFrame(shapePreviewFrameRef.current);
      shapePreviewFrameRef.current = null;
    }
    isDrawingRef.current = false;
    isShapeDrawingRef.current = false;
    shapeDraftRef.current = null;
    shapeDraftBaseImageRef.current = null;

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
  }, [clearKnifePieceSelectionState, clearLassoDraft, publishUnifiedStickDrag, publishUnifiedSymbolDraft, setActiveLassoSelectionState]);

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
    if (isDrawingRef.current || isShapeDrawingRef.current || unifiedStickDragRef.current || bitmapSelectionInteractionRef.current || unifiedSymbolInteractionRef.current) {
      return true;
    }

    if (rasterDraftRef.current !== null || shapePreviewFrameRef.current !== null) {
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

    const canvas = canvasRef.current;
    let preparedCoverage: UnifiedRasterPaintCoverageV1 | null = null;
    if (committedBitmap !== undefined) {
      if (canvas) {
        const companion = getBitmapPaintCoverage(committedBitmap);
        preparedCoverage = companion && (companion.width !== canvas.width || companion.height !== canvas.height)
          ? cropPaintCoverage(companion, -bitmapCenterOffset(canvas.width, companion.width), -bitmapCenterOffset(canvas.height, companion.height), canvas.width, canvas.height)
          : companion;
      }
      // A selection snapshot includes its floating pieces, while this canvas
      // still contains only the backdrop. Keep its existing matching companion;
      // compositing/restoring the selection owns both its pixels and coverage.
      if (canvas && !bitmapSelectionSessionRef.current?.items.length) attachBitmapPaintCoverage(canvas, preparedCoverage);
      authoringCommittedBitmapRef.current = committedBitmap ?? null;
    }
    hasPendingAuthoringChangesRef.current = false;
    authoringDirtyRectRef.current = null;
    authoringDirtyCaptureModeRef.current = "region";
    presentedRasterCommitRef.current = canvas && preparedRasterCommandRef.current && captureVersion != null && committedBitmap !== undefined
      ? { bitmap: committedBitmap, contextKey: currentRasterContextRef.current, generation: captureVersion, width: canvas.width, height: canvas.height } : null;
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

  const stickPointToAuthoringDisplay = useCallback((point: StickFigurePoint) => {
    const stage = getUnifiedStagePresentation();
    return stage ? presentStagePoint(point, stage.presentation) : null;
  }, [getUnifiedStagePresentation]);

  const authoringDisplayToStickPoint = useCallback((point: StickFigurePoint) => {
    const stage = getUnifiedStagePresentation();
    return stage ? authoredStagePoint(point, stage.presentation) : null;
  }, [getUnifiedStagePresentation]);

  const resolveStructuredStickSelection = useCallback((
    selectionBounds: RectBounds,
    selectionPath?: LassoPoint[] | null,
  ): StructuredStickSelection | null => {
    const graph = unifiedStickContent.structureGraph;
    if (graph.joints.length === 0 || graph.limbs.length === 0) return null;
    const displayedJoints = new Map<string, StickFigurePoint>();
    for (const joint of graph.joints) {
      const displayed = stickPointToAuthoringDisplay(joint);
      if (displayed) displayedJoints.set(joint.id, displayed);
    }
    const polygon = selectionPath?.length && selectionPath.length >= 3
      ? selectionPath.map(point => ({ x: point.x, y: point.y }))
      : null;
    const hitsPoint = (point: StickFigurePoint) =>
      polygon ? pointInPolygon(point, polygon) : rectContainsPoint(selectionBounds, point);

    const selectedJointIds = new Set<string>();
    for (const [jointId, point] of displayedJoints) {
      if (hitsPoint(point)) selectedJointIds.add(jointId);
    }
    for (const limb of graph.limbs) {
      const start = displayedJoints.get(limb.startJointId);
      const end = displayedJoints.get(limb.endJointId);
      if (!start || !end) continue;
      const intersects = polygon
        ? segmentIntersectsPolygon(start, end, polygon)
        : segmentIntersectsRect(start, end, selectionBounds);
      if (intersects) {
        selectedJointIds.add(limb.startJointId);
        selectedJointIds.add(limb.endJointId);
      }
    }
    if (selectedJointIds.size === 0) return null;

    // Ordinary Select/Lasso targets the complete connected rig component so
    // transforms cannot leave dangling limb references behind.
    let expanded = true;
    while (expanded) {
      expanded = false;
      for (const limb of graph.limbs) {
        if (!selectedJointIds.has(limb.startJointId) && !selectedJointIds.has(limb.endJointId)) continue;
        if (!selectedJointIds.has(limb.startJointId)) {
          selectedJointIds.add(limb.startJointId);
          expanded = true;
        }
        if (!selectedJointIds.has(limb.endJointId)) {
          selectedJointIds.add(limb.endJointId);
          expanded = true;
        }
      }
    }

    const jointIds = graph.joints
      .filter(joint => selectedJointIds.has(joint.id))
      .map(joint => joint.id);
    const limbIds = graph.limbs
      .filter(limb => selectedJointIds.has(limb.startJointId) && selectedJointIds.has(limb.endJointId))
      .map(limb => limb.id);
    const selectedDisplayPoints = jointIds
      .map(jointId => displayedJoints.get(jointId))
      .filter((point): point is StickFigurePoint => Boolean(point));
    if (selectedDisplayPoints.length === 0) return null;
    const stage = getUnifiedStagePresentation();
    const padding = Math.max(6, (14 * (stage?.presentation.scale ?? 0)) + 3);
    const minX = Math.min(...selectedDisplayPoints.map(point => point.x)) - padding;
    const minY = Math.min(...selectedDisplayPoints.map(point => point.y)) - padding;
    const maxX = Math.max(...selectedDisplayPoints.map(point => point.x)) + padding;
    const maxY = Math.max(...selectedDisplayPoints.map(point => point.y)) + padding;
    return {
      sourceContent: structuredClone(unifiedStickContent),
      jointIds,
      limbIds,
      originBounds: {
        x: minX,
        y: minY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
      },
    };
  }, [getUnifiedStagePresentation, stickPointToAuthoringDisplay, unifiedStickContent]);

  const expandDrawingSelectionSource = useCallback((
    sourceCanvas: HTMLCanvasElement,
    sourceBounds: RectBounds,
    targetBounds: RectBounds,
  ) => {
    const metrics = getAuthoringMetrics();
    if (!metrics) return null;
    if (
      Math.abs(sourceBounds.x - targetBounds.x) < 0.001 &&
      Math.abs(sourceBounds.y - targetBounds.y) < 0.001 &&
      Math.abs(sourceBounds.width - targetBounds.width) < 0.001 &&
      Math.abs(sourceBounds.height - targetBounds.height) < 0.001
    ) {
      return sourceCanvas;
    }
    const expanded = document.createElement("canvas");
    expanded.width = Math.max(1, Math.ceil(targetBounds.width * metrics.scaleX));
    expanded.height = Math.max(1, Math.ceil(targetBounds.height * metrics.scaleY));
    const ctx = expanded.getContext("2d");
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      sourceCanvas,
      (sourceBounds.x - targetBounds.x) * metrics.scaleX,
      (sourceBounds.y - targetBounds.y) * metrics.scaleY,
      sourceBounds.width * metrics.scaleX,
      sourceBounds.height * metrics.scaleY,
    );
    attachBitmapPaintCoverage(expanded, transformPaintCoverage(
      getBitmapPaintCoverage(sourceCanvas), expanded.width, expanded.height,
      (x, y) => ({
        x: (x - (sourceBounds.x - targetBounds.x) * metrics.scaleX) * sourceCanvas.width / (sourceBounds.width * metrics.scaleX),
        y: (y - (sourceBounds.y - targetBounds.y) * metrics.scaleY) * sourceCanvas.height / (sourceBounds.height * metrics.scaleY),
      }),
    ));
    return expanded;
  }, [getAuthoringMetrics]);

  const materializeStructuredStickSelection = useCallback((
    session: BitmapSelectionSession,
  ): StickFigureFrameContent | null => {
    const structured = session.structuredStick;
    const item = session.items[0];
    if (!structured || !item) return null;
    const sourceBounds = structured.originBounds;
    const targetRect = getDisplayedBitmapTransformRect(item);
    const targetCenter = getRectCenter(targetRect);
    const sourceCenter = getRectCenter(sourceBounds);
    const radians = (item.rotation * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const selectedJointIds = new Set(structured.jointIds);
    const next = structuredClone(structured.sourceContent);
    next.structureGraph.joints = next.structureGraph.joints.map(joint => {
      if (!selectedJointIds.has(joint.id)) return joint;
      const displayPoint = stickPointToAuthoringDisplay(joint);
      if (!displayPoint) return joint;
      const normalizedX = (displayPoint.x - sourceCenter.x) / Math.max(1, sourceBounds.width);
      const normalizedY = (displayPoint.y - sourceCenter.y) / Math.max(1, sourceBounds.height);
      const localX = normalizedX * targetRect.width * (item.flipX ? -1 : 1);
      const localY = normalizedY * targetRect.height * (item.flipY ? -1 : 1);
      const transformedDisplay = {
        x: targetCenter.x + localX * cos - localY * sin,
        y: targetCenter.y + localX * sin + localY * cos,
      };
      const transformed = authoringDisplayToStickPoint(transformedDisplay);
      return transformed ? { ...joint, ...transformed } : joint;
    });
    return next;
  }, [authoringDisplayToStickPoint, getDisplayedBitmapTransformRect, stickPointToAuthoringDisplay]);

  const removeStructuredStickSelection = useCallback((
    session: BitmapSelectionSession,
    materialized = materializeStructuredStickSelection(session),
  ): StickFigureFrameContent | null => {
    const structured = session.structuredStick;
    if (!structured || !materialized) return null;
    const selectedJointIds = new Set(structured.jointIds);
    const selectedLimbIds = new Set(structured.limbIds);
    const next = structuredClone(materialized);
    next.structureGraph.joints = next.structureGraph.joints.filter(
      joint => !selectedJointIds.has(joint.id),
    );
    next.structureGraph.limbs = next.structureGraph.limbs.filter(
      limb =>
        !selectedLimbIds.has(limb.id) &&
        !selectedJointIds.has(limb.startJointId) &&
        !selectedJointIds.has(limb.endJointId),
    );
    if (next.structureGraph.activeJointId && selectedJointIds.has(next.structureGraph.activeJointId)) {
      next.structureGraph.activeJointId = null;
    }
    return next;
  }, [materializeStructuredStickSelection]);

  const commitUnifiedSelectionMutation = useCallback((
    session: BitmapSelectionSession,
    nextStickContent: StickFigureFrameContent | null = materializeStructuredStickSelection(session),
  ) => {
    const drawingChanged = session.items.some(item => Boolean(item.sourceCanvas));
    if (!drawingChanged && !nextStickContent) return false;
    if (drawingChanged) markAuthoringDirty();
    if (onUnifiedSelectionActionCommitted) {
      return onUnifiedSelectionActionCommitted({ drawingChanged, stickContent: nextStickContent });
    }
    if (nextStickContent) onUnifiedStickContentChange?.(nextStickContent);
    if (drawingChanged) onAuthoringActionCommitted?.("selection");
    return true;
  }, [markAuthoringDirty, materializeStructuredStickSelection, onAuthoringActionCommitted, onUnifiedSelectionActionCommitted, onUnifiedStickContentChange]);

  const getBitmapSelectionSessionForOwner = useCallback((owner: BitmapSelectionOwner) => {
    const session = bitmapSelectionSessionRef.current;
    if (!session || session.owner !== owner || session.items.length === 0) {
      return null;
    }
    return session;
  }, []);

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
        (rect.x - metrics.worldCenterX) * cameraZoom +
        metrics.hostRect.width / 2 +
        cameraPan.x;
      const top =
        metrics.hostRect.top +
        (rect.y - metrics.worldCenterY) * cameraZoom +
        metrics.hostRect.height / 2 +
        cameraPan.y;
      const right =
        metrics.hostRect.left +
        (rect.x + rect.width - metrics.worldCenterX) * cameraZoom +
        metrics.hostRect.width / 2 +
        cameraPan.x;
      const bottom =
        metrics.hostRect.top +
        (rect.y + rect.height - metrics.worldCenterY) * cameraZoom +
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
    if (!authorizeDestructiveCommand({ commandId: "delete-selection", targetIds: objectIds, availableTargetIds: activeTextObjects.map(object => object.id) }).allowed) return false;
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

    const session = getBitmapSelectionSessionForOwner("select");
    const item = session?.items[0];
    if (!session || !item) return false;
    const nextSession: BitmapSelectionSession = {
      ...session,
      items: [{
        ...item,
        ...resolveBitmapSelectionWithPreservedCenter(item, {
          flipX: axis === "x" ? !item.flipX : item.flipX,
          flipY: axis === "y" ? !item.flipY : item.flipY,
        }),
      }],
    };
    restoreBitmapSelectionBackdropToCanvasRef.current();
    flushBitmapSelectionSessionState(nextSession);
    commitUnifiedSelectionMutation(nextSession);
    return true;
  }, [commitUnifiedSelectionMutation, flipSelectedTextObjects, flushBitmapSelectionSessionState, getBitmapSelectionSessionForOwner, resolveBitmapSelectionWithPreservedCenter]);

  const flipLassoSelection = useCallback((axis: "x" | "y") => {
    const selection = activeLassoSelectionRef.current;
    if (!selection) {
      return false;
    }

    if (selection.kind === "text") {
      return flipSelectedTextObjects(selection.objectIds, axis);
    }

    const session = getBitmapSelectionSessionForOwner("lasso");
    const item = session?.items[0];
    if (!session || !item) return false;
    const nextSession: BitmapSelectionSession = {
      ...session,
      items: [{
        ...item,
        ...resolveBitmapSelectionWithPreservedCenter(item, {
          flipX: axis === "x" ? !item.flipX : item.flipX,
          flipY: axis === "y" ? !item.flipY : item.flipY,
        }),
      }],
    };
    restoreBitmapSelectionBackdropToCanvasRef.current();
    flushBitmapSelectionSessionState(nextSession);
    commitUnifiedSelectionMutation(nextSession);
    return true;
  }, [commitUnifiedSelectionMutation, flipSelectedTextObjects, flushBitmapSelectionSessionState, getBitmapSelectionSessionForOwner, resolveBitmapSelectionWithPreservedCenter]);

  const commitBitmapSelectionRotation = useCallback((owner: "select" | "lasso", rotation: number) => {
    const session = getBitmapSelectionSessionForOwner(owner);
    const item = session?.items[0];
    if (!session || !item || Math.abs(item.rotation - rotation) < 0.001) return false;
    const nextSession: BitmapSelectionSession = {
      ...session,
      items: [{ ...item, rotation }],
    };
    restoreBitmapSelectionBackdropToCanvasRef.current();
    flushBitmapSelectionSessionState(nextSession);
    commitUnifiedSelectionMutation(nextSession);
    return true;
  }, [commitUnifiedSelectionMutation, flushBitmapSelectionSessionState, getBitmapSelectionSessionForOwner]);

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
      preferredSize?: { width: number; height: number },
      symbolReference?: { definitionId: string; definitionDigest: string },
    ) => {
      const image = new Image();
      image.onload = () => {
        const drawWidth = preferredSize ? Math.max(24, preferredSize.width) : Math.max(24, Math.round((image.naturalWidth || 1) * Math.min(1, 220 / Math.max(image.naturalWidth || 1, image.naturalHeight || 1))));
        const drawHeight = preferredSize ? Math.max(24, preferredSize.height) : Math.max(24, Math.round((image.naturalHeight || 1) * Math.min(1, 220 / Math.max(image.naturalWidth || 1, image.naturalHeight || 1))));
        const nextPlacedAsset: ActivePlacedImageAsset = {
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
          symbolDefinitionId: symbolReference?.definitionId,
          symbolDefinitionDigest: symbolReference?.definitionDigest,
        };
        activePlacedImageSourceRef.current = image;
        activePlacedImageAssetRef.current = nextPlacedAsset;
        flushSync(() => {
          setActivePlacedImageAsset(nextPlacedAsset);
          setRightPanelTab("Properties");
          onToolSelect?.("Select");
        });
      };
      const definition = unifiedSymbolDefinitions?.find(candidate => candidate.definitionId === symbolReference?.definitionId);
      image.src = definition?.structuredPayload?.drawingPngDataUrl ?? previewUrl;
    },
    [onToolSelect, unifiedSymbolDefinitions]
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
    }, symbol.definitionDigest ? { definitionId: symbol.id, definitionDigest: symbol.definitionDigest } : undefined);
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

  const cancelPendingAuthoringGesture = useCallback((_reason: string) => {
    void _reason;
    const draft = rasterDraftRef.current;
    rasterDraftRef.current = null;
    if (draft) {
      draft.engine.cancel();
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) for (const tile of draft.tiles.values()) ctx.putImageData(tile.base, tile.left, tile.top);
      if (canvasRef.current) attachBitmapPaintCoverage(canvasRef.current, draft.baseCoverage);
      isDrawingRef.current = false;
      const canvas = canvasRef.current;
      if (canvas?.hasPointerCapture(draft.pointerId)) canvas.releasePointerCapture(draft.pointerId);
    }
    if (isShapeDrawingRef.current && shapeDraftBaseImageRef.current) {
      canvasRef.current?.getContext("2d")?.putImageData(shapeDraftBaseImageRef.current, 0, 0);
      isShapeDrawingRef.current = false; shapeDraftRef.current = null; shapeDraftBaseImageRef.current = null;
    }
  }, []);
  cancelRasterDraftRef.current = cancelPendingAuthoringGesture;

  const sketchDraftAddsPaint = (draft: NonNullable<typeof rasterDraftRef.current>) => {
    const key = draft.engine.options.key;
    return Array.from(draft.tiles.values()).some(tile => tile.presentedCoverage.some((coverage, point) => {
      if (!coverage) return false;
      const previous = tile.basePixels[point];
      return !previous || previous.key.variant !== key.variant || previous.key.color !== key.color ||
        previous.key.opacityByte !== key.opacityByte || Math.min(key.opacityByte, coverage) > previous.coverage;
    }));
  };

  const presentRasterDraft = (preview: RasterPreview | null) => {
    const draft = rasterDraftRef.current, canvas = canvasRef.current, ctx = canvas?.getContext("2d");
    if (!preview?.changed || !draft || !canvas || !ctx || draft.presented === preview) return;
    const rect = preview.changed;
    // The writer clones each accepted pixel. Reuse only this private temporary
    // record, avoiding several short-lived arrays for every changed halo pixel.
    const scratchPixel: ReturnType<typeof mergePaintPixel> = { key: draft.engine.options.key, base: [0, 0, 0, 0], coverage: 1, pigment: [0, 0, 0] };
    draft.dirty = unionRect(draft.dirty, rect);
    for (let top = Math.floor(rect.top / 32) * 32; top < rect.top + rect.height; top += 32) {
      for (let left = Math.floor(rect.left / 32) * 32; left < rect.left + rect.width; left += 32) {
        const key = `${left}:${top}`;
        let tile = draft.tiles.get(key);
        if (!tile) {
          const committed = authoringCommittedBitmapRef.current;
          const width = Math.min(32, canvas.width - left), height = Math.min(32, canvas.height - top);
          const base = committed ? new ImageData(width, height) : ctx.getImageData(left, top, width, height);
          // Use authored bytes as the transaction base. Canvas readback can
          // quantize RGB at low alpha even when no edit has happened.
          if (committed) {
            const offsetX = bitmapCenterOffset(canvas.width, committed.width), offsetY = bitmapCenterOffset(canvas.height, committed.height);
            const sx0 = Math.max(0, left - offsetX), sx1 = Math.min(committed.width, left + base.width - offsetX);
            for (let y = 0; y < base.height; y++) {
              const sy = top + y - offsetY;
              if (sy >= 0 && sy < committed.height && sx1 > sx0) {
                const start = (sy * committed.width + sx0) * 4;
                base.data.set(committed.data.subarray(start, start + (sx1 - sx0) * 4), (y * base.width + sx0 + offsetX - left) * 4);
              }
            }
          }
          // Coverage slots always use the 32-pixel mask stride, including
          // partial edge tiles. These private original pixels are read only.
          const basePixels: ReturnType<typeof getPaintCoverage>[] = Array(1024).fill(null);
          forEachPaintCoverage(draft.baseCoverage, (pixel, x, y) => { basePixels[(y - top) * 32 + x - left] = pixel; }, { x: left, y: top, width, height });
          tile = { left, top, base, basePixels, display: new ImageData(new Uint8ClampedArray(base.data), base.width, base.height), presentedCoverage: new Uint8Array(1024), presentedLight: new Uint8Array(1024) };
          draft.tiles.set(key, tile);
        }
        const maskKey = top / 32 * Math.ceil(canvas.width / 32) + left / 32;
        const stableTile = preview.stable.tiles.get(maskKey), tailTile = preview.tail.tiles.get(maskKey);
        for (let y = Math.max(top, rect.top); y < Math.min(top + tile.base.height, rect.top + rect.height); y++) {
          for (let x = Math.max(left, rect.left); x < Math.min(left + tile.base.width, rect.left + rect.width); x++) {
            const offset = ((y - top) * tile.base.width + x - left) * 4;
            const point = (y - top) * 32 + x - left;
            const coverage = Math.max(stableTile?.coverage[point] ?? 0, tailTile?.coverage[point] ?? 0), previous = tile.basePixels[point];
            const light = Math.max(stableTile?.light[point] ?? 0, tailTile?.light[point] ?? 0);
            // Original pixels/options are fixed for this draft. Reusing an
            // identical incoming mask pair preserves both RGBA and provenance.
            if (coverage === tile.presentedCoverage[point] && light === tile.presentedLight[point]) continue;
            if (!coverage) {
              tile.display.data.set(tile.base.data.subarray(offset, offset + 4), offset);
              if (previous) draft.candidateWriter.set(x, y, previous); else draft.candidateWriter.clear(x, y);
            } else if (draft.erase) {
              tile.display.data.set(tile.base.data.subarray(offset, offset + 4), offset);
              tile.display.data[offset + 3] = Math.round(tile.base.data[offset + 3] * (255 - coverage) / 255);
              if (!tile.display.data[offset + 3]) tile.display.data.fill(0, offset, offset + 4);
              draft.candidateWriter.clear(x, y);
            } else {
              const pixel = mergePaintPixel(previous, tile.base.data, draft.engine.options.key, coverage, light, scratchPixel, offset, draft.ownerId);
              compositeRasterPaint(pixel, tile.display.data, offset);
              draft.candidateWriter.set(x, y, pixel);
            }
            tile.presentedCoverage[point] = coverage; tile.presentedLight[point] = light;
          }
        }
        ctx.putImageData(tile.display, left, top);
      }
    }
    // Resolve ownership as it would be released now. Keep the complete candidate
    // so a stroke that later adds ink also owns its earlier overlapping dabs.
    draft.writer = draft.ownerId && !sketchDraftAddsPaint(draft) ? draft.baseWriter : draft.candidateWriter;
    draft.presented = preview;
  };

  const beginRasterDraft = (e: React.PointerEvent<HTMLCanvasElement>, point: CanvasPoint) => {
    const canvas = canvasRef.current, metrics = getAuthoringMetrics();
    if (!canvas || !metrics || !e.isPrimary || e.button !== 0 || rasterDraftRef.current) return;
    if (hasPendingAuthoringChangesRef.current) {
      try { onAuthoringActionCommitted?.("selection"); } catch { /* Pending state blocks this new draft. */ }
      if (hasPendingAuthoringChangesRef.current) {
        window.alert("The previous edit could not be saved. Your drawing is preserved; retry before drawing another stroke.");
        return;
      }
    }
    authoringDirtyCaptureModeRef.current = "region";
    authoringDirtyRectRef.current = null;
    const erase = activeTool === "Eraser";
    if (erase && !authorizeDestructiveCommand({ commandId: "eraser", targetIds: [currentRasterContextRef.current], availableTargetIds: [currentRasterContextRef.current] }).allowed) return;
    const baseCoverage = getBitmapPaintCoverage(canvas);
    const engine = new RasterGestureDraft({ key: canonicalPaint(erase ? "Brush" : brushToolVariant, erase ? "#000000" : brushColor, erase ? 0 : brushTransparency), size: erase ? eraserSize : brushSize, smoothing: erase ? 0 : brushSmoothing, brightness: glowGradientBrightness, radius: glowGradientRadius, seed: 173, width: canvas.width, height: canvas.height, scaleX: metrics.scaleX, scaleY: metrics.scaleY, ...(!erase && drawRigEnabled ? { drawRig: true as const } : {}) });
    const writer = createPaintCoverageWriter(baseCoverage, canvas.width, canvas.height);
    rasterDraftRef.current = { engine, pointerId: e.pointerId, contextKey: currentRasterContextRef.current, generation: authoringChangeVersionRef.current, erase, ownerId: !erase && brushToolVariant === "Sketch" ? crypto.randomUUID() : undefined, baseCoverage, writer, candidateWriter: writer, baseWriter: !erase && brushToolVariant === "Sketch" ? createPaintCoverageWriter(baseCoverage, canvas.width, canvas.height) : writer, tiles: new Map(), dirty: null, presented: null };
    isDrawingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    try { presentRasterDraft(engine.append(point)); } catch (error) {
      cancelPendingAuthoringGesture("prepare-failed");
      window.alert(`The stroke was canceled; your previous drawing is preserved. ${error instanceof Error ? error.message : ""}`);
    }
  };

  const moveRasterDraft = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const draft = rasterDraftRef.current;
    if (!draft || draft.pointerId !== e.pointerId) return;
    const point = getCanvasPoint(e);
    try {
      if (point) presentRasterDraft(draft.engine.append(point));
    } catch (error) {
      cancelPendingAuthoringGesture("preview-failed");
      window.alert(`The stroke was canceled; your previous drawing is preserved. ${error instanceof Error ? error.message : ""}`);
    }
  };

  const finishRasterDraft = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const draft = rasterDraftRef.current;
    if (!draft || draft.pointerId !== e.pointerId || e.type !== "pointerup") return;
    if (draft.contextKey !== currentRasterContextRef.current || draft.generation !== authoringChangeVersionRef.current) { cancelPendingAuthoringGesture("stale-base"); return; }
    moveRasterDraft(e);
    if (rasterDraftRef.current !== draft) return;
    const prepared = draft.engine.seal();
    if (draft.ownerId && !sketchDraftAddsPaint(draft)) { cancelPendingAuthoringGesture("unchanged-sketch"); return; }
    rasterDraftRef.current = null;
    isDrawingRef.current = false;
    const canvas = canvasRef.current;
    try {
      if (prepared && draft.dirty && canvas) {
        attachBitmapPaintCoverage(canvas, draft.writer.finish());
        markAuthoringDirtyRegion(draft.dirty, true);
        const command: RasterGestureCommandV2 = {
          commandId: RASTER_GESTURE_COMMAND,
          algorithmVersion: RASTER_ALGORITHM_VERSION,
          baseCoverage: draft.baseCoverage, preparedCoverage: getBitmapPaintCoverage(canvas), baseDigest: "", preparedDigest: "",
          operationId: draft.ownerId ?? `${draft.contextKey}:${draft.generation}:${draft.pointerId}`,
          contextKey: draft.contextKey, baseGeneration: draft.generation,
          preparedGeneration: authoringChangeVersionRef.current,
          erase: draft.erase, options: draft.engine.options, samples: draft.engine.points,
          tiles: Array.from(draft.tiles.values(), tile => ({
            left: tile.left, top: tile.top, width: tile.base.width, height: tile.base.height,
            before: tile.base.data, after: tile.display.data,
          })),
        };
        command.baseDigest = rasterCommandDigest(command.tiles, "before", command.baseCoverage);
        command.preparedDigest = rasterCommandDigest(command.tiles, "after", command.preparedCoverage);
        preparedRasterCommandRef.current = command;
        if (onAuthoringActionCommitted?.("stroke", command) === false) throw new Error("raster_commit_rejected");
      }
    } catch (error) {
      const ctx = canvas?.getContext("2d");
      if (ctx) for (const tile of draft.tiles.values()) ctx.putImageData(tile.base, tile.left, tile.top);
      if (canvas) attachBitmapPaintCoverage(canvas, draft.baseCoverage);
      hasPendingAuthoringChangesRef.current = false;
      authoringDirtyRectRef.current = null;
      window.alert(`The stroke could not be committed. Your previous drawing is preserved. ${error instanceof Error ? error.message : ""}`);
    }
    preparedRasterCommandRef.current = null;
    if (canvas?.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  };

  useEffect(() => {
    cancelPendingAuthoringGesture("context-change");
  }, [activeTool, authoringContextKey, drawingToolActivationId, rightPanelTab, isTimelinePlaying, brushToolVariant, drawRigEnabled, cancelPendingAuthoringGesture]);
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => { if (event.key === "Escape") cancelPendingAuthoringGesture("escape"); };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [cancelPendingAuthoringGesture]);

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
      if (!authorizeDestructiveCommand({ commandId: "shape-cutout", targetIds: [currentRasterContextRef.current], availableTargetIds: [currentRasterContextRef.current] }).allowed) {
        ctx.restore();
        return;
      }
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
      cancelPendingAuthoringGesture("unmount");
      cancelShapePreview();
    },
    [cancelPendingAuthoringGesture, cancelShapePreview],
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
    const sourceCtx = selectionSource.getContext("2d");
    if (!sourceCtx || selection.width <= 0 || selection.height <= 0) return false;
    const angle = selection.rotation * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
    const halfWidth = (Math.abs(cos) * selection.width + Math.abs(sin) * selection.height) / 2;
    const halfHeight = (Math.abs(sin) * selection.width + Math.abs(cos) * selection.height) / 2;
    const left = Math.max(0, Math.floor((centerX - halfWidth) * metrics.scaleX));
    const top = Math.max(0, Math.floor((centerY - halfHeight) * metrics.scaleY));
    const right = Math.min(ctx.canvas.width, Math.ceil((centerX + halfWidth) * metrics.scaleX));
    const bottom = Math.min(ctx.canvas.height, Math.ceil((centerY + halfHeight) * metrics.scaleY));
    if (right <= left || bottom <= top) return true;
    const destination = ctx.getImageData(left, top, right - left, bottom - top);
    const prepared = compositeRasterSelectionV1(destination,
      sourceCtx.getImageData(0, 0, selectionSource.width, selectionSource.height),
      getBitmapPaintCoverage(ctx.canvas), getBitmapPaintCoverage(selectionSource),
      ctx.canvas.width, ctx.canvas.height, left, top, (x, y) => {
        const dx = x / metrics.scaleX - centerX, dy = y / metrics.scaleY - centerY;
        return {
          x: ((cos * dx + sin * dy) * (selection.flipX ? -1 : 1) / selection.width + .5) * selectionSource.width,
          y: ((-sin * dx + cos * dy) * (selection.flipY ? -1 : 1) / selection.height + .5) * selectionSource.height,
        };
      });
    ctx.putImageData(new ImageData(prepared.data, destination.width, destination.height), left, top);
    attachBitmapPaintCoverage(ctx.canvas, prepared.paintCoverage);
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
    copyBitmapPaintCoverage(sourceCanvas, clonedCanvas);
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
    copyBitmapPaintCoverage(backdropCanvas, canvas);
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
      if (item.sourceCanvas) {
        drawBitmapSelectionImageToAuthoringCanvas(ctx, item.sourceCanvas, item);
      }
    }
    if (session.items.some(item => Boolean(item.sourceCanvas))) {
      markAuthoringDirty();
    }
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
    if (!session || (!ctx && session.items.some(item => Boolean(item.sourceCanvas)))) {
      return false;
    }

    if (ctx) {
      ctx.globalCompositeOperation = "source-over";
      for (const item of session.items) {
        if (item.sourceCanvas) {
          drawBitmapSelectionImageToAuthoringCanvas(ctx, item.sourceCanvas, item);
        }
      }
    }
    if (session.items.some(item => Boolean(item.sourceCanvas))) {
      markAuthoringDirty();
      captureBitmapSelectionBackdropFromCanvas();
    }

    const duplicatedItems = session.items.map((item) => {
      const duplicatedSourceCanvas = item.sourceCanvas
        ? cloneBitmapSelectionSourceCanvas(item.sourceCanvas)
        : null;
      if (item.sourceCanvas && !duplicatedSourceCanvas) {
        return null;
      }
      if (duplicatedSourceCanvas) attachBitmapPaintCoverage(duplicatedSourceCanvas, remapSketchOwners(getBitmapPaintCoverage(duplicatedSourceCanvas), () => crypto.randomUUID()));
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

    if (owner === "knife") {
      onAuthoringActionCommitted?.("selection");
      flushBitmapSelectionSessionState({ owner, items: duplicatedItems });
      scheduleBitmapSelectionBackdropRestore();
      return true;
    }

    let duplicatedStructuredStick: StructuredStickSelection | null = null;
    if (session.structuredStick) {
      const currentStickContent = materializeStructuredStickSelection(session);
      if (!currentStickContent) return false;
      const sourceJointMap = new Map(
        session.structuredStick.sourceContent.structureGraph.joints.map(joint => [joint.id, joint]),
      );
      const selectedJointIds = new Set(session.structuredStick.jointIds);
      const selectedLimbIds = new Set(session.structuredStick.limbIds);
      const jointIdMap = new Map<string, string>();
      const clonedJoints = session.structuredStick.jointIds.flatMap(jointId => {
        const sourceJoint = sourceJointMap.get(jointId);
        if (!sourceJoint) return [];
        const nextId = crypto.randomUUID();
        jointIdMap.set(jointId, nextId);
        return [{ ...sourceJoint, id: nextId }];
      });
      const clonedLimbs = session.structuredStick.sourceContent.structureGraph.limbs.flatMap(limb => {
        if (!selectedLimbIds.has(limb.id) || !selectedJointIds.has(limb.startJointId) || !selectedJointIds.has(limb.endJointId)) return [];
        const startJointId = jointIdMap.get(limb.startJointId);
        const endJointId = jointIdMap.get(limb.endJointId);
        if (!startJointId || !endJointId) return [];
        return [{ ...limb, id: crypto.randomUUID(), startJointId, endJointId }];
      });
      const nextSourceContent = structuredClone(currentStickContent);
      nextSourceContent.structureGraph.joints.push(...clonedJoints);
      nextSourceContent.structureGraph.limbs.push(...clonedLimbs);
      nextSourceContent.structureGraph.activeJointId = clonedJoints.at(-1)?.id ?? null;
      duplicatedStructuredStick = {
        sourceContent: nextSourceContent,
        jointIds: clonedJoints.map(joint => joint.id),
        limbIds: clonedLimbs.map(limb => limb.id),
        originBounds: { ...session.structuredStick.originBounds },
      };
    }

    const nextSession: BitmapSelectionSession = {
      owner,
      items: duplicatedItems,
      structuredStick: duplicatedStructuredStick,
    };
    flushBitmapSelectionSessionState(nextSession);
    const nextStickContent = duplicatedStructuredStick
      ? materializeStructuredStickSelection(nextSession)
      : null;
    commitUnifiedSelectionMutation(nextSession, nextStickContent);
    scheduleBitmapSelectionBackdropRestore();
    return true;
  }, [captureBitmapSelectionBackdropFromCanvas, cloneBitmapSelectionSourceCanvas, commitUnifiedSelectionMutation, createBitmapSelectionSessionItemId, drawBitmapSelectionImageToAuthoringCanvas, flushBitmapSelectionSessionState, getBitmapSelectionSessionForOwner, markAuthoringDirty, materializeStructuredStickSelection, onAuthoringActionCommitted, scheduleBitmapSelectionBackdropRestore]);

  const deleteBitmapSelectionSession = useCallback((owner: BitmapSelectionOwner) => {
    const session = getBitmapSelectionSessionForOwner(owner);
    if (!session) {
      return false;
    }
    const targets = session.items.map(item => item.id);
    if (!authorizeDestructiveCommand({ commandId: owner === "knife" ? "knife" : "delete-selection", targetIds: targets, availableTargetIds: targets }).allowed) return false;

    const nextStickContent = session.structuredStick
      ? removeStructuredStickSelection(session)
      : null;
    if (session.structuredStick && !nextStickContent) return false;
    setBitmapSelectionSessionState(null);
    if (owner === "knife") {
      markAuthoringDirty();
      onAuthoringActionCommitted?.("selection");
      return true;
    }
    commitUnifiedSelectionMutation(session, nextStickContent);
    return true;
  }, [commitUnifiedSelectionMutation, getBitmapSelectionSessionForOwner, markAuthoringDirty, onAuthoringActionCommitted, removeStructuredStickSelection, setBitmapSelectionSessionState]);

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
    if (!ctx || !activeItem.sourceCanvas) {
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
    if (!session || !activeItem || !activeItem.sourceCanvas || session.items.length <= 1) {
      return duplicateBitmapSelectionSession("knife");
    }

    const duplicatedSourceCanvas = cloneBitmapSelectionSourceCanvas(activeItem.sourceCanvas);
    if (!duplicatedSourceCanvas) {
      return false;
    }
    attachBitmapPaintCoverage(duplicatedSourceCanvas, remapSketchOwners(getBitmapPaintCoverage(duplicatedSourceCanvas), () => crypto.randomUUID()));

    const duplicatedItem: BitmapSelectionSessionItem = {
      ...activeItem,
      id: createBitmapSelectionSessionItemId(),
      sourceCanvas: duplicatedSourceCanvas,
      x: activeItem.x + 16,
      y: activeItem.y + 16,
    };

    setBitmapSelectionSessionState({
      owner: "knife",
      items: [...session.items, duplicatedItem],
    });
    setActiveKnifePieceIdState(duplicatedItem.id);
    markAuthoringDirty();
    onAuthoringActionCommitted?.("selection");
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
    if (!authorizeDestructiveCommand({ commandId: "knife", targetIds: [activeItem.id], availableTargetIds: session.items.map(item => item.id) }).allowed) return;

    setBitmapSelectionSessionState({
      owner: "knife",
      items: session.items.filter((item) => item.id !== activeItem.id),
    });
    markAuthoringDirty();
    onAuthoringActionCommitted?.("selection");
  }, [deleteBitmapSelectionSession, getActiveKnifeSelectionTarget, markAuthoringDirty, onAuthoringActionCommitted, setBitmapSelectionSessionState]);

  const createKnifeCutSelection = useCallback((path: LassoPoint[]) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const metrics = getAuthoringMetrics();
    if (!canvas || !ctx || !metrics || path.length < 2) return;
    if (!authorizeDestructiveCommand({ commandId: "knife", targetIds: [currentRasterContextRef.current], availableTargetIds: [currentRasterContextRef.current] }).allowed) return;
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

    // Connectivity locates the intersected candidate. Authored Sketch ownership
    // then replaces that target with its exact ink, including disconnected dabs.
    const baseCoverage = getBitmapPaintCoverage(canvas);
    const sketchOwner = resolveSketchKnifeOwner(baseCoverage, touchedIndexes.filter(index => targetMask[index] !== 0));
    if (sketchOwner) {
      targetMask.fill(0);
      forEachPaintCoverage(baseCoverage, (pixel, x, y) => {
        if (pixel.owners?.includes(sketchOwner)) targetMask[y * width + x] = 1;
      });
    }

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
      const owned = sketchOwner ? getPaintCoverage(baseCoverage, x, y) : null;
      if (owned?.owners?.some(owner => owner !== sketchOwner)) continue;
      clearedImage.data.set(owned ? owned.base : [0, 0, 0, 0], srcIndex);
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

    const sideOneCanvas = document.createElement("canvas");
    sideOneCanvas.width = sideOneWidth;
    sideOneCanvas.height = sideOneHeight;
    const sideOneCtx = sideOneCanvas.getContext("2d");
    if (!sideOneCtx) return;

    const sideTwoCanvas = document.createElement("canvas");
    sideTwoCanvas.width = sideTwoWidth;
    sideTwoCanvas.height = sideTwoHeight;
    const sideTwoCtx = sideTwoCanvas.getContext("2d");
    if (!sideTwoCtx) return;
    const remaining = createPaintCoverageWriter(baseCoverage, width, height);
    const sideOneCoverage = createPaintCoverageWriter(null, sideOneWidth, sideOneHeight);
    const sideTwoCoverage = createPaintCoverageWriter(null, sideTwoWidth, sideTwoHeight);
    const sideOneOwner = sketchOwner ? crypto.randomUUID() : null;
    const sideTwoOwner = sketchOwner ? crypto.randomUUID() : null;
    forEachPaintCoverage(baseCoverage, (pixel, x, y) => {
      const index = y * width + x;
      if (!targetMask[index]) return;
      remaining.clear(x, y);
      const otherOwners = sketchOwner ? pixel.owners?.filter(owner => owner !== sketchOwner) : undefined;
      if (otherOwners?.length) remaining.set(x, y, { ...pixel, owners: otherOwners });
      if (sideOneMask[index]) {
        const selected = sideOneOwner ? { ...pixel, base: [0, 0, 0, 0] as [number, number, number, number], owners: [sideOneOwner] } : pixel;
        sideOneCoverage.set(x - sideOneMinX, y - sideOneMinY, selected);
        if (sideOneOwner) compositeRasterPaint(selected, sideOneImage.data, ((y - sideOneMinY) * sideOneWidth + x - sideOneMinX) * 4);
      }
      if (sideTwoMask[index]) {
        const selected = sideTwoOwner ? { ...pixel, base: [0, 0, 0, 0] as [number, number, number, number], owners: [sideTwoOwner] } : pixel;
        sideTwoCoverage.set(x - sideTwoMinX, y - sideTwoMinY, selected);
        if (sideTwoOwner) compositeRasterPaint(selected, sideTwoImage.data, ((y - sideTwoMinY) * sideTwoWidth + x - sideTwoMinX) * 4);
      }
    });
    sideOneCtx.putImageData(sideOneImage, 0, 0);
    sideTwoCtx.putImageData(sideTwoImage, 0, 0);
    attachBitmapPaintCoverage(sideOneCanvas, sideOneCoverage.finish());
    attachBitmapPaintCoverage(sideTwoCanvas, sideTwoCoverage.finish());
    const backdrop = cloneBitmapSelectionSourceCanvas(canvas);
    const backdropCtx = backdrop?.getContext("2d");
    if (!backdrop || !backdropCtx) return;
    backdropCtx.putImageData(clearedImage, 0, 0);
    attachBitmapPaintCoverage(backdrop, remaining.finish());

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
    ctx.putImageData(clearedImage, 0, 0);
    copyBitmapPaintCoverage(backdrop, canvas);
    bitmapSelectionBackdropCanvasRef.current = backdrop;
    markAuthoringDirty();
    flushBitmapSelectionSessionState({
      owner: "knife",
      items: nextKnifeItems,
    });
    onAuthoringActionCommitted?.("knife");
    scheduleBitmapSelectionBackdropRestore();
  }, [cloneBitmapSelectionSourceCanvas, createBitmapSelectionSessionItemId, flushBitmapSelectionSessionState, getAuthoringMetrics, markAuthoringDirty, onAuthoringActionCommitted, scheduleBitmapSelectionBackdropRestore]);

  const renderUnifiedStickCapture = useCallback((
    bounds: RectBounds,
    pixelWidth: number,
    pixelHeight: number,
    path?: LassoPoint[] | null,
    target?: {
      content: StickFigureFrameContent;
      jointIds?: string[];
      limbIds?: string[];
    } | null,
  ) => {
    const stage = getUnifiedStagePresentation();
    if (!stage || bounds.width <= 0 || bounds.height <= 0) return null;
    const { presentation } = stage;
    const captureCanvas = document.createElement("canvas");
    captureCanvas.width = Math.max(1, pixelWidth);
    captureCanvas.height = Math.max(1, pixelHeight);
    const captureCtx = captureCanvas.getContext("2d", { willReadFrequently: true });
    if (!captureCtx) return null;
    const scaleX = captureCanvas.width / bounds.width;
    const scaleY = captureCanvas.height / bounds.height;
    if (path && path.length >= 3) {
      captureCtx.beginPath();
      captureCtx.moveTo((path[0].x - bounds.x) * scaleX, (path[0].y - bounds.y) * scaleY);
      for (let index = 1; index < path.length; index += 1) {
        captureCtx.lineTo((path[index].x - bounds.x) * scaleX, (path[index].y - bounds.y) * scaleY);
      }
      captureCtx.closePath();
      captureCtx.clip();
    }
    const toCapturePoint = (joint: StickFigurePoint) => {
      const displayed = presentStagePoint(joint, presentation);
      return {
        x: (displayed.x - bounds.x) * scaleX,
        y: (displayed.y - bounds.y) * scaleY,
      };
    };
    if (target === null) return null;
    const content = target?.content ?? unifiedStickContent;
    const jointIdSet = target?.jointIds ? new Set(target.jointIds) : null;
    const limbIdSet = target?.limbIds ? new Set(target.limbIds) : null;
    const jointMap = new Map(content.structureGraph.joints.map(joint => [joint.id, joint]));
    captureCtx.strokeStyle = "#101218";
    captureCtx.fillStyle = "#101218";
    captureCtx.lineCap = "round";
    captureCtx.lineJoin = "round";
    captureCtx.lineWidth = Math.max(1, 14 * presentation.scale * scaleX);
    for (const limb of content.structureGraph.limbs) {
      if (limbIdSet && !limbIdSet.has(limb.id)) continue;
      const start = jointMap.get(limb.startJointId);
      const end = jointMap.get(limb.endJointId);
      if (!start || !end) continue;
      const startPoint = toCapturePoint(start);
      const endPoint = toCapturePoint(end);
      captureCtx.beginPath();
      captureCtx.moveTo(startPoint.x, startPoint.y);
      captureCtx.lineTo(endPoint.x, endPoint.y);
      captureCtx.stroke();
    }
    const jointRadius = Math.max(1, 14 * presentation.scale * scaleX);
    for (const joint of content.structureGraph.joints) {
      if (jointIdSet && !jointIdSet.has(joint.id)) continue;
      const point = toCapturePoint(joint);
      captureCtx.beginPath();
      captureCtx.arc(point.x, point.y, jointRadius, 0, Math.PI * 2);
      captureCtx.fill();
    }
    const pixels = captureCtx.getImageData(0, 0, captureCanvas.width, captureCanvas.height).data;
    const hasStickFigure = pixels.some((_, index) => index % 4 === 3 && pixels[index] > 0);
    return hasStickFigure ? captureCanvas : null;
  }, [getUnifiedStagePresentation, unifiedStickContent]);

  const createStructuredStickOnlySelection = useCallback((
    owner: "select" | "lasso",
    bounds: RectBounds,
    path?: LassoPoint[] | null,
  ) => {
    const structuredStick = resolveStructuredStickSelection(bounds, path);
    if (!structuredStick) return false;
    captureBitmapSelectionBackdropFromCanvas();
    flushBitmapSelectionSessionState({
      owner,
      items: [{
        id: createBitmapSelectionSessionItemId(),
        sourceCanvas: null,
        x: structuredStick.originBounds.x,
        y: structuredStick.originBounds.y,
        width: structuredStick.originBounds.width,
        height: structuredStick.originBounds.height,
        flipX: false,
        flipY: false,
        rotation: 0,
        allowRotation: true,
      }],
      structuredStick,
    });
    return true;
  }, [captureBitmapSelectionBackdropFromCanvas, createBitmapSelectionSessionItemId, flushBitmapSelectionSessionState, resolveStructuredStickSelection]);

  const createLassoSelection = useCallback((path: LassoPoint[]) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const metrics = getAuthoringMetrics();
    if (!canvas || !ctx || !metrics || path.length < 3) return;

    symbolCaptureLassoPathRef.current = path.map(point => ({ ...point }));
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
      createStructuredStickOnlySelection("lasso", {
        x: minPixelX / metrics.scaleX,
        y: minPixelY / metrics.scaleY,
        width: boxWidth / metrics.scaleX,
        height: boxHeight / metrics.scaleY,
      }, path);
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

    const selectionSourceCanvas = document.createElement("canvas");
    selectionSourceCanvas.width = trimWidth;
    selectionSourceCanvas.height = trimHeight;
    const selectionSourceCtx = selectionSourceCanvas.getContext("2d");
    if (!selectionSourceCtx) return;
    selectionSourceCtx.putImageData(trimmedSelectionPatch, 0, 0);
    const baseCoverage = getBitmapPaintCoverage(canvas);
    const remaining = createPaintCoverageWriter(baseCoverage, canvas.width, canvas.height);
    const extracted = createPaintCoverageWriter(null, trimWidth, trimHeight);
    forEachPaintCoverage(baseCoverage, (pixel, x, y) => {
      const sx = x - minPixelX, sy = y - minPixelY;
      if (sx >= 0 && sy >= 0 && sx < boxWidth && sy < boxHeight && selectedPatch.data[(sy * boxWidth + sx) * 4 + 3]) {
        extracted.set(sx - trimMinX, sy - trimMinY, pixel);
        remaining.clear(x, y);
      }
    });
    attachBitmapPaintCoverage(selectionSourceCanvas, extracted.finish());
    const drawingBounds = {
      x: (minPixelX + trimMinX) / metrics.scaleX,
      y: (minPixelY + trimMinY) / metrics.scaleY,
      width: trimWidth / metrics.scaleX,
      height: trimHeight / metrics.scaleY,
    };
    const selectionBounds = {
      x: minPixelX / metrics.scaleX,
      y: minPixelY / metrics.scaleY,
      width: boxWidth / metrics.scaleX,
      height: boxHeight / metrics.scaleY,
    };
    const structuredStick = resolveStructuredStickSelection(selectionBounds, path);
    const effectiveBounds = structuredStick
      ? unionRectBounds(drawingBounds, structuredStick.originBounds)
      : drawingBounds;
    const effectiveSourceCanvas = structuredStick
      ? expandDrawingSelectionSource(selectionSourceCanvas, drawingBounds, effectiveBounds)
      : selectionSourceCanvas;
    if (!effectiveSourceCanvas) return;
    const backdrop = cloneBitmapSelectionSourceCanvas(canvas);
    const backdropCtx = backdrop?.getContext("2d");
    if (!backdrop || !backdropCtx) return;
    backdropCtx.putImageData(basePatch, minPixelX, minPixelY);
    attachBitmapPaintCoverage(backdrop, remaining.finish());
    ctx.putImageData(basePatch, minPixelX, minPixelY);
    copyBitmapPaintCoverage(backdrop, canvas);
    bitmapSelectionBackdropCanvasRef.current = backdrop;
    markAuthoringDirty();
    flushBitmapSelectionSessionState({
      owner: "lasso",
      items: [{
        id: createBitmapSelectionSessionItemId(),
        sourceCanvas: effectiveSourceCanvas,
        x: effectiveBounds.x,
        y: effectiveBounds.y,
        width: effectiveBounds.width,
        height: effectiveBounds.height,
        flipX: false,
        flipY: false,
        rotation: 0,
        allowRotation: true,
      }],
      structuredStick: structuredStick
        ? { ...structuredStick, originBounds: effectiveBounds }
        : null,
    });
  }, [cloneBitmapSelectionSourceCanvas, clearLassoDraft, createBitmapSelectionSessionItemId, createStructuredStickOnlySelection, displayedTextObjects, expandDrawingSelectionSource, findTextObjectIdsInLassoPath, flushBitmapSelectionSessionState, getAuthoringMetrics, markAuthoringDirty, resolveStructuredStickSelection, setLassoTextSelection]);

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

    symbolCaptureLassoPathRef.current = null;
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
      return createStructuredStickOnlySelection("select", {
        x: minPixelX / metrics.scaleX,
        y: minPixelY / metrics.scaleY,
        width: boxWidth / metrics.scaleX,
        height: boxHeight / metrics.scaleY,
      });
    }

    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = boxWidth;
    sourceCanvas.height = boxHeight;
    const sourceCtx = sourceCanvas.getContext("2d");
    if (!sourceCtx) return false;
    sourceCtx.putImageData(region, 0, 0);
    const baseCoverage = getBitmapPaintCoverage(canvas);
    attachBitmapPaintCoverage(sourceCanvas, cropPaintCoverage(baseCoverage, minPixelX, minPixelY, boxWidth, boxHeight));
    const drawingBounds = {
      x: minPixelX / metrics.scaleX,
      y: minPixelY / metrics.scaleY,
      width: boxWidth / metrics.scaleX,
      height: boxHeight / metrics.scaleY,
    };
    const structuredStick = resolveStructuredStickSelection(drawingBounds);
    const effectiveBounds = structuredStick
      ? unionRectBounds(drawingBounds, structuredStick.originBounds)
      : drawingBounds;
    const effectiveSourceCanvas = structuredStick
      ? expandDrawingSelectionSource(sourceCanvas, drawingBounds, effectiveBounds)
      : sourceCanvas;
    if (!effectiveSourceCanvas) return false;
    const remainingCoverage = patchPaintCoverage(baseCoverage, null, minPixelX, minPixelY, boxWidth, boxHeight, canvas.width, canvas.height);
    const backdrop = cloneBitmapSelectionSourceCanvas(canvas);
    const backdropCtx = backdrop?.getContext("2d");
    if (!backdrop || !backdropCtx) return false;
    region.data.fill(0);
    backdropCtx.putImageData(region, minPixelX, minPixelY);
    attachBitmapPaintCoverage(backdrop, remainingCoverage);
    ctx.putImageData(region, minPixelX, minPixelY);
    copyBitmapPaintCoverage(backdrop, canvas);
    bitmapSelectionBackdropCanvasRef.current = backdrop;
    markAuthoringDirty();
    flushBitmapSelectionSessionState({
      owner: "select",
      items: [{
        id: createBitmapSelectionSessionItemId(),
        sourceCanvas: effectiveSourceCanvas,
        x: effectiveBounds.x,
        y: effectiveBounds.y,
        width: effectiveBounds.width,
        height: effectiveBounds.height,
        flipX: false,
        flipY: false,
        rotation: 0,
        allowRotation: true,
      }],
      structuredStick: structuredStick
        ? { ...structuredStick, originBounds: effectiveBounds }
        : null,
    });

    return true;
  }, [cloneBitmapSelectionSourceCanvas, createBitmapSelectionSessionItemId, createStructuredStickOnlySelection, displayedTextObjects, expandDrawingSelectionSource, findTextObjectIdsInRect, flushBitmapSelectionSessionState, getAuthoringMetrics, markAuthoringDirty, resolveStructuredStickSelection, setSelectTextSelection]);

  const combineDrawingAndStickCapture = useCallback((
    sourceCanvas: HTMLCanvasElement,
    bounds: RectBounds,
    path?: LassoPoint[] | null,
    structuredTarget?: {
      content: StickFigureFrameContent;
      jointIds: string[];
      limbIds: string[];
    } | null,
  ) => {
    const combinedCanvas = document.createElement("canvas");
    combinedCanvas.width = sourceCanvas.width;
    combinedCanvas.height = sourceCanvas.height;
    const combinedCtx = combinedCanvas.getContext("2d", { willReadFrequently: true });
    const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
    if (!combinedCtx || !sourceCtx) return null;
    const sourcePixels = sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height).data;
    const hasDrawing = sourcePixels.some((_, index) => index % 4 === 3 && sourcePixels[index] > 0);
    combinedCtx.drawImage(sourceCanvas, 0, 0);
    const stickCanvas = renderUnifiedStickCapture(
      bounds,
      sourceCanvas.width,
      sourceCanvas.height,
      path,
      structuredTarget === undefined
        ? undefined
        : structuredTarget
          ? { content: structuredTarget.content, jointIds: structuredTarget.jointIds, limbIds: structuredTarget.limbIds }
          : null,
    );
    const hasStickFigure = Boolean(stickCanvas);
    if (stickCanvas) combinedCtx.drawImage(stickCanvas, 0, 0);
    if (!hasDrawing && !hasStickFigure) return null;
    const stage = getUnifiedStagePresentation();
    const structuredPayload: UnifiedStructuredSymbolPayloadV2 | undefined = hasStickFigure && structuredTarget && stage ? {
      version: 1,
      joints: structuredTarget.content.structureGraph.joints
        .filter(joint => structuredTarget.jointIds.includes(joint.id))
        .map(joint => {
          const point = presentStagePoint(joint, stage.presentation);
          return { id: joint.id, x: (point.x - bounds.x) / bounds.width, y: (point.y - bounds.y) / bounds.height };
        }),
      limbs: structuredTarget.content.structureGraph.limbs
        .filter(limb => structuredTarget.limbIds.includes(limb.id))
        .map(limb => ({ id: limb.id, startJointId: limb.startJointId, endJointId: limb.endJointId })),
      drawingPngDataUrl: hasDrawing ? sourceCanvas.toDataURL("image/png") : null,
    } : undefined;
    return {
      canvas: combinedCanvas,
      sourceCategory: classifyUnifiedSymbolSourceV2(hasDrawing, hasStickFigure),
      structuredPayload,
    };
  }, [getUnifiedStagePresentation, renderUnifiedStickCapture]);

  const createSymbolFromCanvasSource = useCallback(
    (
      sourceCanvas: HTMLCanvasElement,
      displaySize: { width: number; height: number },
      sourceCategory: UnifiedSymbolSourceCategoryV2 = "Drawing Symbol",
      sourceRemoval: UnifiedSymbolSourceRemoval | null = null,
      lifecycle?: {
        structuredPayload?: UnifiedStructuredSymbolPayloadV2;
        prepareUnifiedCommit?: () => void;
        restoreAfterFailedUnifiedCommit?: () => void;
      },
    ) => {
      if (pendingSymbolCreationRef.current) return Promise.resolve(false);
      const signature = createCanvasSignature(sourceCanvas);
      if (!onCreateUnifiedSymbolDefinition && librarySymbolsRef.current.some((symbol) => symbol.signature === signature)) {
        setWorkspaceNotice("This symbol already exists.");
        return Promise.resolve(false);
      }

      let fallbackIndex = nextSymbolNumberRef.current;
      while (librarySymbolsRef.current.some((symbol) => symbol.name.toLowerCase() === `symbol ${fallbackIndex}`.toLowerCase())) {
        fallbackIndex += 1;
      }
      const suggestedName = `Symbol ${fallbackIndex}`;
      setWorkspaceNotice(null);
      return new Promise<boolean>((resolve) => {
        pendingSymbolCreationRef.current = {
          sourceCanvas,
          displaySize,
          sourceCategory,
          sourceRemoval,
          ...(lifecycle?.structuredPayload ? { structuredPayload: structuredClone(lifecycle.structuredPayload) } : {}),
          prepareUnifiedCommit: lifecycle?.prepareUnifiedCommit,
          restoreAfterFailedUnifiedCommit: lifecycle?.restoreAfterFailedUnifiedCommit,
          resolve,
        };
        setSymbolDialog({ suggestedName, name: suggestedName, error: null, submitting: false });
      });
    },
    [createCanvasSignature, onCreateUnifiedSymbolDefinition]
  );

  const cancelSymbolCreationDialog = useCallback(() => {
    const pending = pendingSymbolCreationRef.current;
    if (!pending) return;
    pendingSymbolCreationRef.current = null;
    setSymbolDialog(null);
    pending.resolve(false);
  }, []);

  const submitSymbolCreationDialog = useCallback(async () => {
    const pending = pendingSymbolCreationRef.current;
    if (!pending || !symbolDialog || symbolDialog.submitting) return;
    const finalName = symbolDialog.name.trim() || symbolDialog.suggestedName;
    const normalizedName = finalName.toLowerCase();
    if (librarySymbolsRef.current.some(symbol => symbol.name.toLowerCase() === normalizedName)) {
      setSymbolDialog(current => current ? { ...current, error: "This symbol already exists." } : current);
      return;
    }

    setSymbolDialog(current => current ? { ...current, error: null, submitting: true } : current);
    let didCreate = false;
    try {
      if (onCreateUnifiedSymbolDefinition) {
        pending.prepareUnifiedCommit?.();
        didCreate = await onCreateUnifiedSymbolDefinition({
          name: finalName,
          sourceCategory: pending.sourceCategory,
          width: Math.max(1, Math.round(pending.displaySize.width)),
          height: Math.max(1, Math.round(pending.displaySize.height)),
          pngDataUrl: pending.sourceCanvas.toDataURL("image/png"),
          ...(pending.structuredPayload ? { structuredPayload: pending.structuredPayload } : {}),
        }, pending.sourceRemoval);
        if (!didCreate) pending.restoreAfterFailedUnifiedCommit?.();
      } else {
        const signature = createCanvasSignature(pending.sourceCanvas);
        if (!librarySymbolsRef.current.some(symbol => symbol.signature === signature)) {
          const nextSymbol: LibrarySymbol = {
            id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            name: finalName,
            tag: pending.sourceCategory,
            previewUrl: pending.sourceCanvas.toDataURL("image/png"),
            width: Math.max(1, Math.round(pending.displaySize.width)),
            height: Math.max(1, Math.round(pending.displaySize.height)),
            signature,
          };
          const nextSymbols = [...librarySymbolsRef.current, nextSymbol];
          librarySymbolsRef.current = nextSymbols;
          setLibrarySymbols(nextSymbols);
          didCreate = true;
        }
      }
    } catch {
      pending.restoreAfterFailedUnifiedCommit?.();
      didCreate = false;
    }

    if (!didCreate) {
      setSymbolDialog(current => current ? {
        ...current,
        error: "This symbol already exists.",
        submitting: false,
      } : current);
      return;
    }

    const match = /^Symbol (\d+)$/i.exec(finalName);
    nextSymbolNumberRef.current = match
      ? Math.max(nextSymbolNumberRef.current, Number(match[1]) + 1)
      : nextSymbolNumberRef.current;
    pendingSymbolCreationRef.current = null;
    setSymbolDialog(null);
    setWorkspaceNotice(`Created ${finalName} in Library.`);
    pending.resolve(true);
  }, [createCanvasSignature, onCreateUnifiedSymbolDefinition, symbolDialog]);

  useEffect(() => {
    if (!symbolDialog) return;
    const frame = window.requestAnimationFrame(() => {
      symbolNameInputRef.current?.focus();
      symbolNameInputRef.current?.select();
    });
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancelSymbolCreationDialog();
    };
    window.addEventListener("keydown", cancelOnEscape);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", cancelOnEscape);
    };
  }, [cancelSymbolCreationDialog, symbolDialog]);

  const convertSelectedTextObjectsToSymbol = useCallback(async (objectIds: string[]) => {
    const selectionSource = createTextSelectionCanvas(objectIds, displayedTextObjects);
    if (!selectionSource) {
      return false;
    }

    const combined = combineDrawingAndStickCapture(selectionSource.canvas, selectionSource.bounds, null, null);
    if (!combined) return false;
    const remainingTextObjects = displayedTextObjects.filter(textObject => !objectIds.includes(textObject.id));
    const didCreate = await createSymbolFromCanvasSource(combined.canvas, {
      width: selectionSource.bounds.width,
      height: selectionSource.bounds.height,
    }, combined.sourceCategory, onCreateUnifiedSymbolDefinition ? {
      drawingChanged: false,
      stickContent: null,
      textObjects: remainingTextObjects,
    } : null);
    if (didCreate) {
      if (!onCreateUnifiedSymbolDefinition) commitTextObjects(remainingTextObjects);
      clearTextSelectionState();
    }
    return didCreate;
  }, [clearTextSelectionState, combineDrawingAndStickCapture, commitTextObjects, createSymbolFromCanvasSource, createTextSelectionCanvas, displayedTextObjects, onCreateUnifiedSymbolDefinition]);

  const convertBitmapSelectionSessionToSymbol = useCallback(async (owner: BitmapSelectionOwner) => {
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
      if (item.sourceCanvas) {
        drawBitmapSelectionImageToAuthoringCanvas(fullCtx, item.sourceCanvas, item);
      }
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
    const captureBounds = {
      x: pixelLeft / metrics.scaleX,
      y: pixelTop / metrics.scaleY,
      width: pixelWidth / metrics.scaleX,
      height: pixelHeight / metrics.scaleY,
    };
    const materializedStickContent = materializeStructuredStickSelection(session);
    const combined = combineDrawingAndStickCapture(
      croppedCanvas,
      captureBounds,
      null,
      session.structuredStick && materializedStickContent
        ? {
            content: materializedStickContent,
            jointIds: session.structuredStick.jointIds,
            limbIds: session.structuredStick.limbIds,
          }
        : null,
    );
    if (!combined) return false;
    const sourceRemoval: UnifiedSymbolSourceRemoval | null = onCreateUnifiedSymbolDefinition ? {
      drawingChanged: session.items.some(item => Boolean(item.sourceCanvas)),
      stickContent: session.structuredStick
        ? removeStructuredStickSelection(session, materializedStickContent)
        : null,
      textObjects: null,
    } : null;
    let preparedUnifiedCommit = false;
    let rollbackBackdrop: HTMLCanvasElement | null = null;
    const didCreate = await createSymbolFromCanvasSource(combined.canvas, {
      width: pixelWidth / metrics.scaleX,
      height: pixelHeight / metrics.scaleY,
    }, combined.sourceCategory, sourceRemoval, onCreateUnifiedSymbolDefinition ? {
      structuredPayload: combined.structuredPayload,
      prepareUnifiedCommit: () => {
        rollbackBackdrop = bitmapSelectionBackdropCanvasRef.current;
        preparedUnifiedCommit = true;
        flushBitmapSelectionSessionState(null);
      },
      restoreAfterFailedUnifiedCommit: () => {
        if (!preparedUnifiedCommit) return;
        flushBitmapSelectionSessionState(session);
        bitmapSelectionBackdropCanvasRef.current = rollbackBackdrop;
        scheduleBitmapSelectionBackdropRestore();
        preparedUnifiedCommit = false;
      },
    } : undefined);
    if (didCreate && !onCreateUnifiedSymbolDefinition) {
      setBitmapSelectionSessionState(null);
      const drawingChanged = session.items.some(item => Boolean(item.sourceCanvas));
      if (drawingChanged) markAuthoringDirty();
      if (drawingChanged) onAuthoringActionCommitted?.("selection");
    }
    return didCreate;
  }, [combineDrawingAndStickCapture, createSymbolFromCanvasSource, drawBitmapSelectionImageToAuthoringCanvas, flushBitmapSelectionSessionState, getAuthoringMetrics, getBitmapSelectionSessionForOwner, getDisplayedBitmapTransformBounds, markAuthoringDirty, materializeStructuredStickSelection, onAuthoringActionCommitted, onCreateUnifiedSymbolDefinition, removeStructuredStickSelection, scheduleBitmapSelectionBackdropRestore, setBitmapSelectionSessionState]);

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
      const definition = unifiedSymbolDefinitions?.find(candidate => candidate.definitionId === placedAsset.symbolDefinitionId);
      if (!definition?.structuredPayload || definition.structuredPayload.drawingPngDataUrl) {
        ctx.drawImage(placedSource, -placedAsset.width / 2, -placedAsset.height / 2, placedAsset.width, placedAsset.height);
      }
      if (definition?.structuredPayload) {
        drawStructuredSymbolGeometry(ctx, resolveStructuredSymbolGeometryV2(definition, {
          x: -placedAsset.width / 2, y: -placedAsset.height / 2, width: placedAsset.width, height: placedAsset.height,
        }), getUnifiedStagePresentation()?.presentation.scale ?? 1);
      }
      ctx.restore();
    },
    [getDisplayedPlacedImageRect, getUnifiedStagePresentation, unifiedSymbolDefinitions]
  );

  const captureAuthoringSnapshot = useCallback((options?: DrawingCanvasSnapshotOptions): DrawingCanvasSnapshot | null => {
    if (rasterDraftRef.current) return null;
    const identity = { generation: authoringChangeVersionRef.current, contextKey: currentRasterContextRef.current };
    if (preparedFillSnapshotRef.current && options?.includePreviewUrl !== true) {
      return { bitmap: preparedFillSnapshotRef.current, previewUrl: undefined, captureVersion: identity.generation, identity };
    }
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
      Boolean(placedAsset && placedSource && !placedAsset.symbolDefinitionId);

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
      copyBitmapPaintCoverage(canvas, snapshotCanvas);

      if (activeBitmapSession?.items.length) {
        compositeSnapshotCtx.globalCompositeOperation = "source-over";
        for (const item of activeBitmapSession.items) {
          if (item.sourceCanvas) {
            drawBitmapSelectionImageToAuthoringCanvas(compositeSnapshotCtx, item.sourceCanvas, item);
          }
        }
      }

      if (placedAsset && placedSource && !placedAsset.symbolDefinitionId) {
        compositeSnapshotCtx.globalCompositeOperation = "source-over";
        drawPlacedImageAsset(compositeSnapshotCtx, placedSource, placedAsset);
      }

      compositeSnapshotCtx.setTransform(1, 0, 0, 1, 0, 0);
      snapshotCtx = compositeSnapshotCtx;
      snapshotPreviewSource = snapshotCanvas;
    } else {
      const committedBitmap = authoringCommittedBitmapRef.current;
      const prepared = preparedRasterCommandRef.current;
      const dirtyRect = authoringDirtyCaptureModeRef.current !== "region" ? null : prepared?.tiles.length
        ? prepared.tiles.reduce((rect, tile) => {
            const left = Math.min(rect.left, tile.left), top = Math.min(rect.top, tile.top);
            return { left, top, width: Math.max(rect.left + rect.width, tile.left + tile.width) - left, height: Math.max(rect.top + rect.height, tile.top + tile.height) - top };
          }, { left: prepared.tiles[0].left, top: prepared.tiles[0].top, width: prepared.tiles[0].width, height: prepared.tiles[0].height })
        : authoringDirtyRectRef.current;
      const canUseDirtyPatch =
        options?.preferIncrementalBitmapCapture === true &&
        !includePreviewUrl &&
        dirtyRect &&
        (preparedRasterCommandRef.current || !committedBitmap || (committedBitmap.width === canvas.width && committedBitmap.height === canvas.height));

      if (canUseDirtyPatch) {
        const bitmapCaptureStart = performance.now();
        const dirtyPatch = prepared ? new ImageData(dirtyRect.width, dirtyRect.height) : sourceCtx.getImageData(
          dirtyRect.left,
          dirtyRect.top,
          dirtyRect.width,
          dirtyRect.height,
        );
        if (prepared) {
          // The command owns exact RGBA. Keep gaps byte-exact from the authored
          // base; avoid both GPU readback stalls and low-alpha RGB quantization.
          if (committedBitmap) {
            const offsetX = bitmapCenterOffset(canvas.width, committedBitmap.width);
            const offsetY = bitmapCenterOffset(canvas.height, committedBitmap.height);
            const left = Math.max(dirtyRect.left, offsetX), right = Math.min(dirtyRect.left + dirtyRect.width, offsetX + committedBitmap.width);
            for (let y = Math.max(dirtyRect.top, offsetY); y < Math.min(dirtyRect.top + dirtyRect.height, offsetY + committedBitmap.height); y++) {
              if (right <= left) continue;
              const start = ((y - offsetY) * committedBitmap.width + left - offsetX) * 4;
              dirtyPatch.data.set(committedBitmap.data.subarray(start, start + (right - left) * 4), ((y - dirtyRect.top) * dirtyRect.width + left - dirtyRect.left) * 4);
            }
          }
        }
        if (prepared) for (const tile of prepared.tiles) {
          for (let y = Math.max(tile.top, dirtyRect.top); y < Math.min(tile.top + tile.height, dirtyRect.top + dirtyRect.height); y++) {
            const left = Math.max(tile.left, dirtyRect.left), right = Math.min(tile.left + tile.width, dirtyRect.left + dirtyRect.width);
            if (right <= left) continue;
            const start = ((y - tile.top) * tile.width + left - tile.left) * 4;
            dirtyPatch.data.set(tile.after.subarray(start, start + (right - left) * 4), ((y - dirtyRect.top) * dirtyRect.width + left - dirtyRect.left) * 4);
          }
        }
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
          identity,
          dirtyPatchBitmap: attachBitmapPaintCoverage(dirtyPatch, cropPaintCoverage(prepared ? prepared.preparedCoverage : getBitmapPaintCoverage(canvas), dirtyRect.left, dirtyRect.top, dirtyRect.width, dirtyRect.height)),
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
      bitmap: snapshotBitmap ? copyBitmapPaintCoverage(snapshotCtx.canvas, snapshotBitmap) : null,
      previewUrl,
      captureVersion,
      identity,
    };
    return result;
  }, [cameraPan, cameraZoom, drawBitmapSelectionImageToAuthoringCanvas, drawPlacedImageAsset, getAuthoringMetrics, getDisplayedBitmapTransformBounds]);

  useImperativeHandle(
    ref,
    () => ({
      captureAuthoringSnapshot,
      cancelPendingAuthoringGesture,
      getAuthoringSnapshotIdentity: () => ({ generation: authoringChangeVersionRef.current, contextKey: currentRasterContextRef.current }),
      clearTransientEditingState,
      getPlaybackSurfaceLayout,
      hasActiveBitmapSelectionSession: () => Boolean(bitmapSelectionSessionRef.current?.items.length),
      hasPendingAuthoringChanges,
      markAuthoringChangesCommitted,
      takePresentedRasterCommit: (bitmap) => {
        const ticket = presentedRasterCommitRef.current;
        presentedRasterCommitRef.current = null;
        const canvas = canvasRef.current;
        return Boolean(ticket && canvas && ticket.bitmap === bitmap && ticket.contextKey === currentRasterContextRef.current &&
          ticket.generation === authoringChangeVersionRef.current && ticket.width === canvas.width && ticket.height === canvas.height &&
          !hasPendingAuthoringChangesRef.current && !bitmapSelectionSessionRef.current?.items.length);
      },
      setOnionOverlayContent,
      shouldDeferAuthoringSnapshotCapture,
    }),
    [
      captureAuthoringSnapshot,
      cancelPendingAuthoringGesture,
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

    if (
      placedAsset.symbolDefinitionId &&
      placedAsset.symbolDefinitionDigest &&
      onUnifiedSymbolInstancesChange
    ) {
      const stage = getUnifiedStagePresentation();
      if (!stage) return;
      const displayRect = getDisplayedPlacedImageRect(placedAsset);
      const stageOrigin = authoredStagePoint(
        { x: displayRect.x, y: displayRect.y },
        stage.presentation,
      );
      const instance: UnifiedSymbolInstanceItemV2 = {
        itemId: crypto.randomUUID(),
        kind: "symbol-instance/v1",
        definitionId: placedAsset.symbolDefinitionId,
        definitionDigest: placedAsset.symbolDefinitionDigest,
        x: stageOrigin.x,
        y: stageOrigin.y,
        width: placedAsset.width / stage.presentation.scale,
        height: placedAsset.height / stage.presentation.scale,
        rotation: placedAsset.rotation,
        flipX: placedAsset.flipX,
        flipY: placedAsset.flipY,
      };
      if (!onUnifiedSymbolInstancesChange([...unifiedSymbolInstances, instance])) return;
      placedImageInteractionRef.current = null;
      activePlacedImageSourceRef.current = null;
      setActivePlacedImageAsset(null);
      setSelectedUnifiedSymbolInstanceId(instance.itemId);
      return;
    }

    drawPlacedImageAsset(ctx, placedSource, placedAsset);
    markAuthoringDirty();
    placedImageInteractionRef.current = null;
    activePlacedImageSourceRef.current = null;
    setActivePlacedImageAsset(null);
    onAuthoringActionCommitted?.("placed-asset");
  }, [drawPlacedImageAsset, getDisplayedPlacedImageRect, getUnifiedStagePresentation, markAuthoringDirty, onAuthoringActionCommitted, onUnifiedSymbolInstancesChange, unifiedSymbolInstances]);

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

    clearUnifiedSymbolSelection();
    clearTransientEditingState();
  }, [clearTransientEditingState, clearUnifiedSymbolSelection, isTimelinePlaying]);

  useEffect(() => {
    if (previousEditingContextKeyRef.current === editingContextKey) {
      return;
    }

    previousEditingContextKeyRef.current = editingContextKey;
    clearUnifiedSymbolSelection();

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
    clearUnifiedSymbolSelection,
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
        // Onion uses occupied ink, independent of authored RGB or alpha. Keep
        // the existing next-on-top order without blending two directional hues.
        const mask = workCtx.getImageData(0, 0, width, height);
        for (let offset = 0; offset < mask.data.length; offset += 4) {
          if (!mask.data[offset + 3]) continue;
          mask.data[offset] = mask.data[offset + 1] = mask.data[offset + 2] = 0;
          mask.data[offset + 3] = 255;
        }
        workCtx.putImageData(mask, 0, 0);
        overlayCtx.save();
        overlayCtx.setTransform(1, 0, 0, 1, 0, 0);
        overlayCtx.globalCompositeOperation = "destination-out";
        overlayCtx.drawImage(workCanvas, 0, 0);
        overlayCtx.restore();
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
    if (isTimelinePlaying) return;
    const stage = getUnifiedStagePresentation();
    if (!stage) return;
    const { metrics, presentation } = stage;
    const content = onionOverlayContentRef.current;
    let cancelled = false;
    // Decode first, then compose each complete owner into ONE alpha mask. A stale
    // decode must never repaint after scrubbing, disabling onion, or playback.
    const images = new Map<string, HTMLImageElement>();
    const definitions = unifiedSymbolDefinitions ?? [];
    const instances = [...content.previousSymbolInstances, ...content.nextSymbolInstances];
    const render = async () => {
      await Promise.all([...new Set(instances.map(instance => instance.definitionId))].map(async id => {
        const definition = definitions.find(candidate => candidate.definitionId === id);
        if (!definition) return;
        const image = new Image();
        const rasterUrl = definition.structuredPayload ? definition.structuredPayload.drawingPngDataUrl : definition.pngDataUrl;
        if (!rasterUrl) return;
        image.src = rasterUrl;
        try { await image.decode(); images.set(id, image); } catch { /* Invalid assets do not paint. */ }
      }));
      if (cancelled) return;
      for (const direction of ["previous", "next"] as const) {
        const bitmap = content[direction === "previous" ? "previousBitmap" : "nextBitmap"];
        const textObjects = content[direction === "previous" ? "previousTextObjects" : "nextTextObjects"];
        const stick = content[direction === "previous" ? "previousStickContent" : "nextStickContent"];
        const symbols = content[direction === "previous" ? "previousSymbolInstances" : "nextSymbolInstances"];
        if (!bitmap && !textObjects.length && !symbols.length && !stick?.structureGraph.joints.length && !stick?.structureGraph.limbs.length) continue;
        drawTintedOnionMask(onionCtx, baseCanvas.width, baseCanvas.height, ONION_TINT_STYLES[direction].fillStyle, ctx => {
          if (bitmap) {
            ctx.putImageData(bitmap, bitmapCenterOffset(baseCanvas.width, bitmap.width), bitmapCenterOffset(baseCanvas.height, bitmap.height));
          }
          ctx.setTransform(metrics.scaleX, 0, 0, metrics.scaleY, 0, 0);
          for (const text of textObjects) drawDrawingTextObject(ctx, text, { colorOverride: ONION_TEXT_MASK_COLOR, opacity: 1 });
          ctx.translate(presentation.offsetX, presentation.offsetY);
          ctx.scale(presentation.scale, presentation.scale);
          ctx.fillStyle = ONION_TEXT_MASK_COLOR;
          ctx.strokeStyle = ONION_TEXT_MASK_COLOR;
          ctx.lineWidth = 14;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          const graph = stick?.structureGraph;
          for (const limb of graph?.limbs ?? []) {
            const start = graph!.joints.find(joint => joint.id === limb.startJointId);
            const end = graph!.joints.find(joint => joint.id === limb.endJointId);
            if (!start || !end) continue;
            ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke();
          }
          for (const joint of graph?.joints ?? []) {
            ctx.beginPath(); ctx.arc(joint.x, joint.y, 14, 0, Math.PI * 2); ctx.fill();
          }
          for (const instance of symbols) {
            const definition = definitions.find(candidate => candidate.definitionId === instance.definitionId);
            const image = images.get(instance.definitionId);
            if (!definition || definition.definitionDigest !== instance.definitionDigest) continue;
            ctx.save();
            const cx = instance.x + instance.width / 2;
            const cy = instance.y + instance.height / 2;
            ctx.translate(cx, cy);
            ctx.rotate(instance.rotation * Math.PI / 180);
            ctx.scale(instance.flipX ? -1 : 1, instance.flipY ? -1 : 1);
            if (image) ctx.drawImage(image, -instance.width / 2, -instance.height / 2, instance.width, instance.height);
            drawStructuredSymbolGeometry(ctx, resolveStructuredSymbolGeometryV2(definition, {
              x: -instance.width / 2, y: -instance.height / 2, width: instance.width, height: instance.height,
            }));
            ctx.restore();
          }
        });
      }
    };
    void render();
    return () => { cancelled = true; };
  }, [authoringSurfaceVersion, drawTintedOnionMask, getUnifiedStagePresentation, isTimelinePlaying, onionOverlayVersion, unifiedSymbolDefinitions]);

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
  }, [authoringSurfaceVersion, displayedTextObjects, getAuthoringMetrics, isTimelinePlaying]);

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
        if (item.sourceCanvas) {
          drawBitmapSelectionImage(overlayCtx, item.sourceCanvas, item);
        }
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
    if (hasPendingAuthoringChangesRef.current) {
      try { onAuthoringActionCommitted?.("selection"); } catch { /* The pending edit blocks a new fill. */ }
      if (hasPendingAuthoringChangesRef.current) return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const point = getCanvasPoint(e);
    if (!point) return;
    const x = point.pixelX;
    const y = point.pixelY;
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;

    const rollbackImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const rollbackCoverage = getBitmapPaintCoverage(canvas);
    const imageData = new ImageData(new Uint8ClampedArray(rollbackImage.data), canvas.width, canvas.height);
    const committed = authoringCommittedBitmapRef.current;
    if (committed) {
      imageData.data.fill(0);
      const offsetX = bitmapCenterOffset(canvas.width, committed.width), offsetY = bitmapCenterOffset(canvas.height, committed.height);
      const left = Math.max(0, offsetX), right = Math.min(canvas.width, offsetX + committed.width);
      for (let row = Math.max(0, offsetY); row < Math.min(canvas.height, offsetY + committed.height); row++) {
        if (right <= left) continue;
        const start = ((row - offsetY) * committed.width + left - offsetX) * 4;
        imageData.data.set(committed.data.subarray(start, start + (right - left) * 4), (row * canvas.width + left) * 4);
      }
    }
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
    const coverageWriter = createPaintCoverageWriter(getBitmapPaintCoverage(canvas), width, height);
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
      coverageWriter.clear(currentX, currentY);

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

    const filledCoverage = coverageWriter.finish();
    ctx.putImageData(imageData, 0, 0);
    attachBitmapPaintCoverage(canvas, filledCoverage);
    markAuthoringDirty();
    preparedFillSnapshotRef.current = attachBitmapPaintCoverage(imageData, filledCoverage);
    try {
      if (onAuthoringActionCommitted?.("fill") === false) throw new Error("fill_commit_failed");
    } catch {
      ctx.putImageData(rollbackImage, 0, 0);
      attachBitmapPaintCoverage(canvas, rollbackCoverage);
      markAuthoringChangesCommitted();
      window.alert("The fill could not be committed. Your drawing is preserved; retry the fill.");
    } finally {
      preparedFillSnapshotRef.current = null;
    }
  };

  const startCanvasStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    clearUnifiedSymbolSelection();
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
    const point = getCanvasPoint(e);
    if (point) beginRasterDraft(e, point);
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

    moveRasterDraft(e);
  };

  const endCanvasStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.type === "pointerleave") return;
    if (rasterDraftRef.current) { finishRasterDraft(e); return; }
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
        e.currentTarget.hasPointerCapture(e.pointerId)
      ) {
        return;
      }
      // Consume the final pointer sample before sealing this interaction. A
      // commit can synchronously render; lost capture must then be a no-op.
      if (e.type === "pointerup") moveCanvasStroke(e);
      bitmapSelectionInteractionRef.current = null;
      if (interaction.didTransform) {
        const session = getBitmapSelectionSessionForOwner(interaction.owner);
        if (session && interaction.owner !== "knife") {
          commitUnifiedSelectionMutation(session);
        } else {
          // Moving a floating Knife piece changes the composed document even
          // though the backdrop canvas itself has not been repainted.
          markAuthoringDirty();
          onAuthoringActionCommitted?.("selection");
        }
        scheduleBitmapSelectionBackdropRestore();
      }
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
        const coverage = getBitmapPaintCoverage(ctx.canvas);
        if (coverage) {
          const transform = ctx.getTransform();
          const padding = getShapeOutlineWidth(shapeOutlineThickness) * 8 + 2;
          const corners = [
            new DOMPoint(Math.min(draft.startX, draft.endX) - padding, Math.min(draft.startY, draft.endY) - padding),
            new DOMPoint(Math.max(draft.startX, draft.endX) + padding, Math.min(draft.startY, draft.endY) - padding),
            new DOMPoint(Math.min(draft.startX, draft.endX) - padding, Math.max(draft.startY, draft.endY) + padding),
            new DOMPoint(Math.max(draft.startX, draft.endX) + padding, Math.max(draft.startY, draft.endY) + padding),
          ].map(corner => corner.matrixTransform(transform));
          const left = Math.max(0, Math.floor(Math.min(...corners.map(p => p.x))));
          const top = Math.max(0, Math.floor(Math.min(...corners.map(p => p.y))));
          const right = Math.min(ctx.canvas.width, Math.ceil(Math.max(...corners.map(p => p.x))));
          const bottom = Math.min(ctx.canvas.height, Math.ceil(Math.max(...corners.map(p => p.y))));
          const writer = createPaintCoverageWriter(coverage, ctx.canvas.width, ctx.canvas.height);
          if (right > left && bottom > top) {
            const after = ctx.getImageData(left, top, right - left, bottom - top);
            forEachPaintCoverage(coverage, (_pixel, x, y) => {
              if (x < left || y < top || x >= right || y >= bottom) return;
              const beforeIndex = (y * baseImage.width + x) * 4, afterIndex = ((y - top) * after.width + x - left) * 4;
              for (let channel = 0; channel < 4; channel++) if (baseImage.data[beforeIndex + channel] !== after.data[afterIndex + channel]) {
                writer.clear(x, y);
                break;
              }
            });
          }
          attachBitmapPaintCoverage(ctx.canvas, writer.finish());
        }
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

    finishRasterDraft(e);
  };

  const cancelCanvasStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (rasterDraftRef.current) { cancelPendingAuthoringGesture("pointer-cancel"); return; }
    const releaseCapture = () => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    };

    if (placedImageInteractionRef.current && activePlacedImageAssetRef.current) {
      const interaction = placedImageInteractionRef.current;
      const placedAsset = activePlacedImageAssetRef.current;
      setActivePlacedImageAsset(
        interaction.mode === "moving"
          ? { ...placedAsset, x: interaction.startX, y: interaction.startY }
          : interaction.mode === "rotating"
            ? { ...placedAsset, rotation: interaction.startRotation }
            : {
                ...placedAsset,
                x: interaction.startX,
                y: interaction.startY,
                width: interaction.startWidth,
                height: interaction.startHeight,
                flipX: interaction.startFlipX,
                flipY: interaction.startFlipY,
              },
      );
      placedImageInteractionRef.current = null;
      releaseCapture();
      return;
    }

    if (bitmapSelectionInteractionRef.current) {
      const interaction = bitmapSelectionInteractionRef.current;
      updateBitmapSelectionSessionItem(interaction.owner, interaction.itemId, (item) =>
        interaction.mode === "moving"
          ? { ...item, x: interaction.startX, y: interaction.startY }
          : interaction.mode === "rotating"
            ? { ...item, rotation: interaction.startRotation }
            : {
                ...item,
                x: interaction.startX,
                y: interaction.startY,
                width: interaction.startWidth,
                height: interaction.startHeight,
                flipX: interaction.startFlipX,
                flipY: interaction.startFlipY,
              },
      );
      bitmapSelectionInteractionRef.current = null;
      restoreBitmapSelectionBackdropToCanvas();
      releaseCapture();
      return;
    }

    if (textInteractionRef.current) {
      textInteractionRef.current = null;
      setTextDraftObjects(null);
      releaseCapture();
      return;
    }

    if (selectionBoxDraft) {
      setSelectionBoxDraft(null);
      releaseCapture();
      return;
    }

    if (lassoInteractionRef.current) {
      clearLassoDraft();
      releaseCapture();
      return;
    }

    if (knifeInteractionRef.current) {
      clearKnifeDraft();
      releaseCapture();
      return;
    }

    if (isShapeDrawingRef.current) {
      cancelShapePreview();
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx && shapeDraftBaseImageRef.current) {
        ctx.putImageData(shapeDraftBaseImageRef.current, 0, 0);
      }
      isShapeDrawingRef.current = false;
      shapeDraftRef.current = null;
      shapeDraftBaseImageRef.current = null;
      releaseCapture();
      return;
    }

    cancelPendingAuthoringGesture("pointer-cancel");

    releaseCapture();
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
    const owner = currentRasterContextRef.current;
    if (!authorizeDestructiveCommand({ commandId: "clear-canvas", targetIds: [owner], availableTargetIds: [owner], confirmed: true }).allowed) return;
    cancelPendingAuthoringGesture("clear-canvas");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    attachBitmapPaintCoverage(canvas, null);
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

  const readFileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("asset_read_failed"));
    reader.onerror = () => reject(reader.error ?? new Error("asset_read_failed"));
    reader.readAsDataURL(file);
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
      setWorkspaceNotice("This asset has already been imported.");
    }

    if (filesToImport.length === 0) {
      e.target.value = "";
      return;
    }

    const nextAssets = await Promise.all(
      filesToImport.map(async (file, index) => {
        const isImage = file.type.startsWith("image/");
        const previewUrl = isImage ? await readFileAsDataUrl(file) : null;
        if (previewUrl && !onUnifiedAssetsImported) {
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

    if (onUnifiedAssetsImported) {
      const catalogAssets = await Promise.all(filesToImport.map(async (file, index) => {
        const asset = nextAssets[index];
        return createProjectAssetV2({
          assetId: asset.id,
          name: asset.name,
          kind: asset.kind,
          mimeType: file.type || "application/octet-stream",
          byteLength: file.size,
          width: asset.width,
          height: asset.height,
          dataUrl: asset.previewUrl,
          sourceBytes: new Uint8Array(await file.arrayBuffer()),
        });
      }));
      if (!onUnifiedAssetsImported(catalogAssets)) {
        setWorkspaceNotice("An asset with this name has already been imported.");
      }
    } else {
      setImportedAssets((prev) => [...prev, ...nextAssets]);
    }
    filesToImport.forEach((file) => pendingAssetImportNamesRef.current.delete(file.name));
    e.target.value = "";
  };

  const renderedUnifiedSymbolInstances = unifiedSymbolInstances.map(instance =>
    draftUnifiedSymbolInstance?.itemId === instance.itemId ? draftUnifiedSymbolInstance : instance,
  );
  const selectedUnifiedSymbolInstance = renderedUnifiedSymbolInstances.find(
    instance => instance.itemId === selectedUnifiedSymbolInstanceId,
  ) ?? null;
  const unifiedSymbolStagePoint = (event: React.PointerEvent<SVGElement>) => {
    const svg = event.currentTarget.ownerSVGElement;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const stagePoint = point.matrixTransform(matrix.inverse());
    return { x: stagePoint.x, y: stagePoint.y };
  };
  const beginUnifiedSymbolGesture = (event: React.PointerEvent<SVGElement>, instance: UnifiedSymbolInstanceItemV2, handle?: ResizeHandle) => {
    if (activeTool !== "Select" || canvasInteractionOwner !== "drawing" || isTimelinePlaying || !onUnifiedSymbolInstancesChange || !event.isPrimary || event.button !== 0) return;
    const point = unifiedSymbolStagePoint(event);
    if (!point) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    unifiedSymbolInteractionRef.current = {
      pointerId: event.pointerId,
      itemId: instance.itemId,
      startPointer: point,
      startX: instance.x,
      startY: instance.y,
      initial: structuredClone(instance),
      handle,
    };
    setSelectedUnifiedSymbolInstanceId(instance.itemId);
    publishUnifiedSymbolDraft(structuredClone(instance));
    setRightPanelTab("Properties");
  };
  const moveUnifiedSymbolGesture = (event: React.PointerEvent<SVGElement>) => {
    const interaction = unifiedSymbolInteractionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    const point = unifiedSymbolStagePoint(event);
    if (!point) return;
    event.stopPropagation();
    if (interaction.handle) {
      const initial = interaction.initial;
      const angle = initial.rotation * Math.PI / 180;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const dx = point.x - interaction.startPointer.x, dy = point.y - interaction.startPointer.y;
      const localX = (cos * dx + sin * dy) * (initial.flipX ? -1 : 1);
      const localY = (-sin * dx + cos * dy) * (initial.flipY ? -1 : 1);
      const h = interaction.handle;
      const width = Math.max(4, initial.width + (h.includes("e") ? localX : h.includes("w") ? -localX : 0));
      const height = Math.max(4, initial.height + (h.includes("s") ? localY : h.includes("n") ? -localY : 0));
      const shiftX = (width - initial.width) / 2 * (h.includes("w") ? -1 : 1) * (initial.flipX ? -1 : 1);
      const shiftY = (height - initial.height) / 2 * (h.includes("n") ? -1 : 1) * (initial.flipY ? -1 : 1);
      publishUnifiedSymbolDraft({ ...initial, width, height,
        x: initial.x + (cos * shiftX - sin * shiftY - (width - initial.width) / 2),
        y: initial.y + (sin * shiftX + cos * shiftY - (height - initial.height) / 2),
      });
      return;
    }
    publishUnifiedSymbolDraft({
      ...interaction.initial,
      x: interaction.startX + (point.x - interaction.startPointer.x),
      y: interaction.startY + (point.y - interaction.startPointer.y),
    });
  };
  const finishUnifiedSymbolGesture = (event: React.PointerEvent<SVGElement>) => {
    const interaction = unifiedSymbolInteractionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    event.stopPropagation();
    moveUnifiedSymbolGesture(event);
    unifiedSymbolInteractionRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const draft = draftUnifiedSymbolInstanceRef.current;
    publishUnifiedSymbolDraft(null);
    if (!draft) return;
    const current = unifiedSymbolInstances.find(instance => instance.itemId === draft.itemId);
    if (!current || (current.x === draft.x && current.y === draft.y && current.width === draft.width && current.height === draft.height)) return;
    onUnifiedSymbolInstancesChange?.(unifiedSymbolInstances.map(instance => instance.itemId === draft.itemId ? draft : instance));
  };
  const cancelUnifiedSymbolGesture = (event: React.PointerEvent<SVGElement>) => {
    const interaction = unifiedSymbolInteractionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    event.stopPropagation();
    unifiedSymbolInteractionRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    publishUnifiedSymbolDraft(null);
  };
  const updateSelectedUnifiedSymbol = (updates: Partial<Pick<UnifiedSymbolInstanceItemV2, "rotation" | "flipX" | "flipY">>) => {
    if (!selectedUnifiedSymbolInstance || !onUnifiedSymbolInstancesChange) return;
    onUnifiedSymbolInstancesChange(unifiedSymbolInstances.map(instance =>
      instance.itemId === selectedUnifiedSymbolInstance.itemId ? { ...instance, ...updates } : instance,
    ));
  };
  const duplicateSelectedUnifiedSymbol = () => {
    if (!selectedUnifiedSymbolInstance || !onUnifiedSymbolInstancesChange) return;
    const duplicate = { ...structuredClone(selectedUnifiedSymbolInstance), itemId: crypto.randomUUID(), x: selectedUnifiedSymbolInstance.x + 32, y: selectedUnifiedSymbolInstance.y + 32 };
    if (onUnifiedSymbolInstancesChange([...unifiedSymbolInstances, duplicate])) setSelectedUnifiedSymbolInstanceId(duplicate.itemId);
  };
  const deleteSelectedUnifiedSymbol = () => {
    if (!selectedUnifiedSymbolInstance || !onUnifiedSymbolInstancesChange) return;
    if (!authorizeDestructiveCommand({ commandId: "delete-instance", targetIds: [selectedUnifiedSymbolInstance.itemId], availableTargetIds: unifiedSymbolInstances.map(instance => instance.itemId) }).allowed) return;
    if (onUnifiedSymbolInstancesChange(unifiedSymbolInstances.filter(instance => instance.itemId !== selectedUnifiedSymbolInstance.itemId))) {
      setSelectedUnifiedSymbolInstanceId(null);
    }
  };

  useEffect(() => {
    if (selectedUnifiedSymbolInstanceId && !unifiedSymbolInstances.some(instance => instance.itemId === selectedUnifiedSymbolInstanceId)) {
      setSelectedUnifiedSymbolInstanceId(null);
    }
  }, [selectedUnifiedSymbolInstanceId, unifiedSymbolInstances]);

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

        {selectedUnifiedSymbolInstance && (
          <div data-unified-symbol-properties style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ color: "rgba(255,255,255,0.74)", fontSize: 11 }}>Symbol instance</div>
            <div style={{ color: "rgba(255,255,255,0.62)", fontSize: 12 }}>
              This instance has an independent transform and keeps its project Library definition linked by digest.
            </div>
            <RotationValueField value={selectedUnifiedSymbolInstance.rotation} onCommit={(rotation) => updateSelectedUnifiedSymbol({ rotation })} />
            <button type="button" onClick={() => updateSelectedUnifiedSymbol({ flipX: !selectedUnifiedSymbolInstance.flipX })} style={{ minHeight: 34, borderRadius: 8, border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.04)", color: "white", cursor: "pointer" }}>Flip X</button>
            <button type="button" onClick={() => updateSelectedUnifiedSymbol({ flipY: !selectedUnifiedSymbolInstance.flipY })} style={{ minHeight: 34, borderRadius: 8, border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.04)", color: "white", cursor: "pointer" }}>Flip Y</button>
            <button type="button" onClick={duplicateSelectedUnifiedSymbol} style={{ minHeight: 34, borderRadius: 8, border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.04)", color: "white", cursor: "pointer" }}>Duplicate Instance</button>
            <button type="button" onClick={deleteSelectedUnifiedSymbol} style={{ minHeight: 34, borderRadius: 8, border: "1px solid rgba(255,120,120,.26)", background: "rgba(255,80,80,.06)", color: "white", cursor: "pointer" }}>Delete Instance</button>
          </div>
        )}

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
                onCommit={(rotation) => commitBitmapSelectionRotation("select", rotation)}
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, color: "rgba(255,255,255,0.76)", fontSize: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span>Draw Rig</span>
            <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 10 }}>Straighten each live run as you draw.</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-label="Draw Rig"
            aria-checked={drawRigEnabled}
            onClick={() => setDrawRigEnabled((enabled) => !enabled)}
            style={{
              minWidth: 46,
              minHeight: 26,
              padding: "4px 9px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.18)",
              background: drawRigEnabled ? "rgba(95,170,255,0.34)" : "rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.9)",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {drawRigEnabled ? "On" : "Off"}
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, color: "rgba(255,255,255,0.76)", fontSize: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div>Color</div>
              <input
                type="color"
                aria-label="Brush color"
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
                onCommit={(rotation) => commitBitmapSelectionRotation("lasso", rotation)}
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
              {onRemoveUnifiedSymbolDefinition && (
                <button
                  type="button"
                  aria-label={`Delete ${item.name} definition`}
                  onPointerDown={event => event.stopPropagation()}
                  onClick={event => {
                    event.stopPropagation();
                    if (!onRemoveUnifiedSymbolDefinition(item.id)) {
                      setWorkspaceNotice("Delete the symbol instances that use this definition first.");
                    }
                  }}
                  style={{ marginLeft: "auto", border: "1px solid rgba(255,120,120,.22)", borderRadius: 7, background: "rgba(255,80,80,.05)", color: "rgba(255,255,255,.72)", cursor: "pointer", padding: "4px 7px" }}
                >
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const unifiedStickPoint = (event: React.PointerEvent<SVGSVGElement>): StickFigurePoint | null => {
    const matrix = event.currentTarget.getScreenCTM();
    if (!matrix) return null;
    const point = event.currentTarget.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const stagePoint = point.matrixTransform(matrix.inverse());
    return { x: stagePoint.x, y: stagePoint.y };
  };
  const nearestUnifiedStickJoint = (point: StickFigurePoint, joints = unifiedStickContent.structureGraph.joints, excludeJointId: string | null = null) => {
    let nearest: (typeof joints)[number] | null = null;
    let distance = 18;
    for (const joint of joints) {
      if (joint.id === excludeJointId) continue;
      const candidateDistance = Math.hypot(joint.x - point.x, joint.y - point.y);
      if (candidateDistance <= distance) { nearest = joint; distance = candidateDistance; }
    }
    return nearest;
  };
  const unifiedStickEndpointJoints = (() => {
    const degree = new Map<string, number>();
    unifiedStickContent.structureGraph.limbs.forEach((limb) => {
      degree.set(limb.startJointId, (degree.get(limb.startJointId) ?? 0) + 1);
      degree.set(limb.endJointId, (degree.get(limb.endJointId) ?? 0) + 1);
    });
    return unifiedStickContent.structureGraph.joints.filter((joint) => (degree.get(joint.id) ?? 0) <= 1);
  })();
  const beginUnifiedStickGesture = (event: React.PointerEvent<SVGSVGElement>) => {
    if (isTimelinePlaying || !onUnifiedStickContentChange || !event.isPrimary || event.button !== 0) return;
    event.stopPropagation();
    clearUnifiedSymbolSelection();
    const point = unifiedStickPoint(event);
    if (!point) return;
    const joint = nearestUnifiedStickJoint(point, unifiedStickMode === "add-limb" ? unifiedStickEndpointJoints : unifiedStickContent.structureGraph.joints);
    if (unifiedStickMode === "select" && !joint) { setUnifiedSelectedJointId(null); return; }
    event.currentTarget.setPointerCapture(event.pointerId);
    const startPoint = joint ? { x: joint.x, y: joint.y } : point;
    publishUnifiedStickDrag({
      pointerId: event.pointerId,
      startPoint,
      currentPoint: startPoint,
      startJointId: unifiedStickMode === "add-limb" ? joint?.id ?? null : null,
      movingJointId: unifiedStickMode === "select" ? joint?.id ?? null : null,
      jointOffset: joint ? { x: joint.x - point.x, y: joint.y - point.y } : { x: 0, y: 0 },
      contextKey: editingContextKey,
      mode: unifiedStickMode,
      sourceContent: structuredClone(unifiedStickContent),
    });
    setUnifiedSelectedJointId(joint?.id ?? null);
    event.preventDefault();
  };
  const moveUnifiedStickGesture = (event: React.PointerEvent<SVGSVGElement>) => {
    const current = unifiedStickDragRef.current;
    if (!current || event.pointerId !== current.pointerId) return;
    event.stopPropagation();
    const point = unifiedStickPoint(event);
    if (!point) return;
    publishUnifiedStickDrag({
      ...current,
      currentPoint: current.movingJointId
        ? { x: point.x + current.jointOffset.x, y: point.y + current.jointOffset.y }
        : point,
    });
    event.preventDefault();
  };
  const finishUnifiedStickGesture = (event: React.PointerEvent<SVGSVGElement>) => {
    const draft = unifiedStickDragRef.current;
    if (!draft || event.pointerId !== draft.pointerId) return;
    event.stopPropagation();
    publishUnifiedStickDrag(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (draft.contextKey !== editingContextKey || isTimelinePlaying || !onUnifiedStickContentChange) return;
    const pointerPoint = unifiedStickPoint(event) ?? draft.currentPoint;
    const end = draft.movingJointId
      ? { x: pointerPoint.x + draft.jointOffset.x, y: pointerPoint.y + draft.jointOffset.y }
      : pointerPoint;
    const next = structuredClone(draft.sourceContent);
    if (draft.mode === "select" && draft.movingJointId) {
      const joint = next.structureGraph.joints.find(value => value.id === draft.movingJointId);
      if (!joint || Math.hypot(end.x - draft.startPoint.x, end.y - draft.startPoint.y) < 1) return;
      joint.x = end.x; joint.y = end.y; next.structureGraph.activeJointId = joint.id;
      onUnifiedStickContentChange(next); return;
    }
    if (draft.mode !== "add-limb") return;
    const existingEnd = nearestUnifiedStickJoint(end, draft.sourceContent.structureGraph.joints, draft.startJointId);
    const endPoint = existingEnd ? { x: existingEnd.x, y: existingEnd.y } : end;
    if (Math.hypot(endPoint.x - draft.startPoint.x, endPoint.y - draft.startPoint.y) < 18) return;
    const startId = draft.startJointId ?? crypto.randomUUID();
    const endId = existingEnd?.id ?? crypto.randomUUID();
    if (!draft.startJointId) next.structureGraph.joints.push({ id: startId, ...draft.startPoint });
    if (!existingEnd) next.structureGraph.joints.push({ id: endId, ...endPoint });
    next.structureGraph.limbs.push({ id: crypto.randomUUID(), startJointId: startId, endJointId: endId });
    next.structureGraph.activeJointId = endId;
    setUnifiedSelectedJointId(endId);
    onUnifiedStickContentChange(next);
  };
  const cancelUnifiedStickGesture = (event: React.PointerEvent<SVGSVGElement>) => {
    const draft = unifiedStickDragRef.current;
    if (!draft || event.pointerId !== draft.pointerId) return;
    event.stopPropagation();
    publishUnifiedStickDrag(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  useEffect(() => {
    if (!unifiedStickDrag) return;
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const draft = unifiedStickDragRef.current;
      publishUnifiedStickDrag(null);
      const svg = unifiedStickSvgRef.current;
      if (draft && svg?.hasPointerCapture(draft.pointerId)) svg.releasePointerCapture(draft.pointerId);
    };
    window.addEventListener("keydown", cancelOnEscape);
    return () => window.removeEventListener("keydown", cancelOnEscape);
  }, [publishUnifiedStickDrag, unifiedStickDrag]);
  useLayoutEffect(() => {
    setCanvasInteractionOwner("drawing");
    clearUnifiedSymbolSelection();
    const current = unifiedStickDragRef.current;
    publishUnifiedStickDrag(null);
    const svg = unifiedStickSvgRef.current;
    if (current && svg?.hasPointerCapture(current.pointerId)) svg.releasePointerCapture(current.pointerId);
  }, [clearUnifiedSymbolSelection, drawingToolActivationId, publishUnifiedStickDrag]);
  const activateUnifiedStickTool = (mode: "select" | "add-limb") => {
    clearUnifiedSymbolSelection();
    clearTransientEditingState();
    setUnifiedStickMode(mode);
    setCanvasInteractionOwner("stick");
  };
  const handleRightPanelTabChange = (tab: DrawingRightPanelTab) => {
    setRightPanelTab(tab);
    if (tab === "Stick Figure Tools") {
      clearUnifiedSymbolSelection();
      clearTransientEditingState();
      setCanvasInteractionOwner("stick");
    }
  };
  const selectionPreviewStickContent = activeBitmapSelectionSession?.structuredStick
    ? materializeStructuredStickSelection(activeBitmapSelectionSession)
    : null;
  const baseRenderedUnifiedStickContent = selectionPreviewStickContent ?? unifiedStickContent;
  const renderedUnifiedStickContent = unifiedStickDrag?.movingJointId ? {
    ...baseRenderedUnifiedStickContent,
    structureGraph: {
      ...baseRenderedUnifiedStickContent.structureGraph,
      joints: baseRenderedUnifiedStickContent.structureGraph.joints.map((joint) => joint.id === unifiedStickDrag.movingJointId ? { ...joint, ...unifiedStickDrag.currentPoint } : joint),
    },
  } : baseRenderedUnifiedStickContent;
  const unifiedStickPreviewEndJoint = unifiedStickDrag && !unifiedStickDrag.movingJointId
    ? nearestUnifiedStickJoint(unifiedStickDrag.currentPoint, unifiedStickContent.structureGraph.joints, unifiedStickDrag.startJointId)
    : null;
  const unifiedStickPreviewEndPoint = unifiedStickPreviewEndJoint
    ? { x: unifiedStickPreviewEndJoint.x, y: unifiedStickPreviewEndJoint.y }
    : unifiedStickDrag?.currentPoint ?? null;
  const stickToolsTabContent = (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div><div style={{ color: "rgba(255,255,255,0.92)", fontSize: 14, fontWeight: 800 }}>STICK FIGURE TOOLS</div><div style={{ color: "rgba(255,255,255,0.62)", fontSize: 12 }}>Create and edit segments in this frame.</div></div>
      <button type="button" onClick={() => activateUnifiedStickTool("add-limb")} style={{ minHeight: 38, borderRadius: 8, border: unifiedStickMode === "add-limb" && canvasInteractionOwner === "stick" ? "1px solid rgba(110,170,255,.5)" : "1px solid rgba(255,255,255,.12)", background: unifiedStickMode === "add-limb" && canvasInteractionOwner === "stick" ? "rgba(110,170,255,.14)" : "rgba(255,255,255,.04)", color: "white", cursor: "pointer" }}>Add Limb</button>
      <button type="button" onClick={() => activateUnifiedStickTool("select")} style={{ minHeight: 38, borderRadius: 8, border: unifiedStickMode === "select" && canvasInteractionOwner === "stick" ? "1px solid rgba(110,170,255,.5)" : "1px solid rgba(255,255,255,.12)", background: unifiedStickMode === "select" && canvasInteractionOwner === "stick" ? "rgba(110,170,255,.14)" : "rgba(255,255,255,.04)", color: "white", cursor: "pointer" }}>Select / Move Joint</button>
      <button type="button" aria-label="Open Stick Figure Creator" onClick={onOpenStickFigureCreator} disabled={isTimelinePlaying} style={{ minHeight: 38, borderRadius: 8, border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.04)", color: "white", cursor: isTimelinePlaying ? "not-allowed" : "pointer", opacity: isTimelinePlaying ? 0.55 : 1 }}>Creator</button>
      <div style={{ color: "rgba(255,255,255,.58)" }}>{unifiedStickContent.structureGraph.joints.length} joints · {unifiedStickContent.structureGraph.limbs.length} segments</div>
    </div>
  );
  const rightPanelContent = rightPanelTab === "Stick Figure Tools" ? stickToolsTabContent :
    rightPanelTab === "Properties" ? propertiesTabContent : rightPanelTab === "Assets" ? assetsTabContent : libraryTabContent;

  return (
    <>
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
            <svg
              aria-label="Project symbol instances"
              viewBox="0 0 1920 1080"
              preserveAspectRatio="xMidYMid meet"
              style={{ position: "absolute", zIndex: 6, left: `${CAMERA_FRAME_INSET_PERCENT}%`, top: `${CAMERA_FRAME_INSET_PERCENT}%`, width: `${CAMERA_FRAME_SIZE_PERCENT}%`, height: `${CAMERA_FRAME_SIZE_PERCENT}%`, overflow: "visible", pointerEvents: "none" }}
            >
              {renderedUnifiedSymbolInstances.map(instance => {
                const definition = unifiedSymbolDefinitions?.find(candidate => candidate.definitionId === instance.definitionId);
                if (!definition || definition.definitionDigest !== instance.definitionDigest) return null;
                const centerX = instance.x + instance.width / 2;
                const centerY = instance.y + instance.height / 2;
                const transform = `translate(${centerX} ${centerY}) rotate(${instance.rotation}) scale(${instance.flipX ? -1 : 1} ${instance.flipY ? -1 : 1}) translate(${-centerX} ${-centerY})`;
                const selected = instance.itemId === selectedUnifiedSymbolInstanceId && activeTool === "Select" && canvasInteractionOwner === "drawing";
                const geometry = resolveStructuredSymbolGeometryV2(definition, instance);
                const rasterUrl = definition.structuredPayload ? definition.structuredPayload.drawingPngDataUrl : definition.pngDataUrl;
                return (
                  <g key={instance.itemId} transform={transform} data-unified-symbol-instance={instance.itemId}>
                    {rasterUrl ? <image
                      data-symbol-raster
                      href={rasterUrl} x={instance.x} y={instance.y}
                      width={instance.width} height={instance.height}
                      preserveAspectRatio="none" style={{ pointerEvents: "none" }}
                    /> : null}
                    {geometry?.limbs.map(limb => <line data-symbol-segment key={limb.id}
                      x1={limb.start.x} y1={limb.start.y} x2={limb.end.x} y2={limb.end.y}
                      stroke="#101218" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />)}
                    {geometry?.joints.map(joint => <circle data-symbol-joint key={joint.id}
                      cx={joint.x} cy={joint.y} r="14" fill="#101218" />)}
                    <rect data-symbol-hit-target x={instance.x} y={instance.y} width={instance.width} height={instance.height}
                      fill="transparent" style={{ pointerEvents: activeTool === "Select" && canvasInteractionOwner === "drawing" && !isTimelinePlaying ? "all" : "none", cursor: "move" }}
                      onPointerDown={event => beginUnifiedSymbolGesture(event, instance)}
                      onPointerMove={moveUnifiedSymbolGesture} onPointerUp={finishUnifiedSymbolGesture}
                      onPointerCancel={cancelUnifiedSymbolGesture} onLostPointerCapture={cancelUnifiedSymbolGesture} />
                    {selected && !isTimelinePlaying ? <>
                      <rect x={instance.x} y={instance.y} width={instance.width} height={instance.height}
                        fill="none" stroke="#398bff" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeDasharray="6 4" style={{ pointerEvents: "none" }} />
                      {RESIZE_HANDLE_ORDER.map(handle => <circle key={handle} data-symbol-resize-handle={handle}
                        cx={instance.x + (handle.includes("w") ? 0 : handle.includes("e") ? instance.width : instance.width / 2)}
                        cy={instance.y + (handle.includes("n") ? 0 : handle.includes("s") ? instance.height : instance.height / 2)}
                        r={6 / Math.max(0.01, (getUnifiedStagePresentation()?.presentation.scale ?? 1) * cameraZoom)}
                        fill="white" stroke="#398bff" strokeWidth="2" vectorEffect="non-scaling-stroke"
                        style={{ pointerEvents: activeTool === "Select" ? "all" : "none", cursor: handle + "-resize" }}
                        onPointerDown={event => beginUnifiedSymbolGesture(event, instance, handle)}
                        onPointerMove={moveUnifiedSymbolGesture} onPointerUp={finishUnifiedSymbolGesture}
                        onPointerCancel={cancelUnifiedSymbolGesture} onLostPointerCapture={cancelUnifiedSymbolGesture} />)}
                    </> : null}
                  </g>
                );
              })}
            </svg>
            <svg
              ref={unifiedStickSvgRef}
              aria-label="Editable stick figure content"
              viewBox="0 0 1920 1080"
              preserveAspectRatio="xMidYMid meet"
              data-canvas-interaction-owner={canvasInteractionOwner}
              style={{ position: "absolute", zIndex: 7, left: `${CAMERA_FRAME_INSET_PERCENT}%`, top: `${CAMERA_FRAME_INSET_PERCENT}%`, width: `${CAMERA_FRAME_SIZE_PERCENT}%`, height: `${CAMERA_FRAME_SIZE_PERCENT}%`, overflow: "visible", pointerEvents: canvasInteractionOwner === "stick" && rightPanelTab === "Stick Figure Tools" && !isTimelinePlaying ? "auto" : "none", touchAction: "none", cursor: unifiedStickMode === "add-limb" ? "crosshair" : "default" }}
              onPointerDown={beginUnifiedStickGesture}
              onPointerMove={moveUnifiedStickGesture}
              onPointerUp={finishUnifiedStickGesture}
              onPointerCancel={cancelUnifiedStickGesture}
              onLostPointerCapture={cancelUnifiedStickGesture}
            >
              {renderedUnifiedStickContent.structureGraph.limbs.map(limb => {
                const start = renderedUnifiedStickContent.structureGraph.joints.find(joint => joint.id === limb.startJointId);
                const end = renderedUnifiedStickContent.structureGraph.joints.find(joint => joint.id === limb.endJointId);
                return start && end ? <line key={limb.id} x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="#101218" strokeWidth="14" strokeLinecap="round" /> : null;
              })}
              {unifiedStickDrag && !unifiedStickDrag.movingJointId && unifiedStickPreviewEndPoint ? <>
                <line x1={unifiedStickDrag.startPoint.x} y1={unifiedStickDrag.startPoint.y} x2={unifiedStickPreviewEndPoint.x} y2={unifiedStickPreviewEndPoint.y} stroke="#398bff" strokeOpacity="0.72" strokeWidth="10" strokeLinecap="round" />
                <circle cx={unifiedStickPreviewEndPoint.x} cy={unifiedStickPreviewEndPoint.y} r="14" fill="#398bff" />
              </> : null}
              {renderedUnifiedStickContent.structureGraph.joints.map(joint => <circle key={joint.id} cx={joint.x} cy={joint.y} r={joint.id === unifiedSelectedJointId ? 22 : 14} fill={joint.id === unifiedSelectedJointId ? "#398bff" : "#101218"} />)}
            </svg>
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
                touchAction:
                  activeTool === "Fill" || isTimelinePlaying
                    ? "auto"
                    : "none",
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
              onPointerCancel={cancelCanvasStroke}
              onLostPointerCapture={cancelCanvasStroke}
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
              pointerEvents: activeTool === "Select" && canvasInteractionOwner === "drawing" && canvasMovementEnabled && !activePlacedImageAsset ? "auto" : "none",
              cursor:
                activeTool === "Select" && canvasInteractionOwner === "drawing" && canvasMovementEnabled && !activePlacedImageAsset
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
        onRightPanelTabChange={handleRightPanelTabChange}
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
    {symbolDialog && (
      <div
        role="presentation"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1200,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
          background: "rgba(4, 7, 12, 0.72)",
        }}
      >
        <form
          role="dialog"
          aria-modal="true"
          aria-labelledby="symbol-name-dialog-title"
          aria-describedby="symbol-name-dialog-help"
          onSubmit={(event) => {
            event.preventDefault();
            void submitSymbolCreationDialog();
          }}
          style={{
            width: "min(440px, 100%)",
            display: "flex",
            flexDirection: "column",
            gap: 16,
            padding: 24,
            borderRadius: 16,
            border: "1px solid rgba(255,255,255,0.16)",
            background: "rgb(24, 28, 36)",
            boxShadow: "0 24px 80px rgba(0,0,0,0.52)",
            color: "white",
          }}
        >
          <div>
            <h2 id="symbol-name-dialog-title" style={{ margin: 0, fontSize: 20 }}>Name this symbol</h2>
            <p id="symbol-name-dialog-help" style={{ margin: "7px 0 0", color: "rgba(255,255,255,0.64)", fontSize: 13 }}>
              Give this reusable Library symbol a unique name.
            </p>
          </div>
          <input
            ref={symbolNameInputRef}
            aria-label="Symbol name"
            value={symbolDialog.name}
            disabled={symbolDialog.submitting}
            onChange={(event) => setSymbolDialog(current => current ? {
              ...current,
              name: event.target.value,
              error: null,
            } : current)}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "11px 12px",
              borderRadius: 9,
              border: symbolDialog.error ? "1px solid #ff7b86" : "1px solid rgba(110,170,255,0.55)",
              background: "rgba(255,255,255,0.05)",
              color: "white",
              fontSize: 15,
              outline: "none",
            }}
          />
          {symbolDialog.error && (
            <div role="alert" style={{ color: "#ff9aa3", fontSize: 13 }}>{symbolDialog.error}</div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button
              type="button"
              disabled={symbolDialog.submitting}
              onClick={cancelSymbolCreationDialog}
              style={{ minWidth: 88, minHeight: 40, borderRadius: 9, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.05)", color: "white", cursor: "pointer" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={symbolDialog.submitting}
              style={{ minWidth: 88, minHeight: 40, borderRadius: 9, border: "1px solid rgba(110,170,255,0.62)", background: "rgba(57,139,255,0.24)", color: "white", cursor: "pointer", fontWeight: 700 }}
            >
              {symbolDialog.submitting ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    )}
    {workspaceNotice && (
      <div
        role="status"
        aria-live="polite"
        style={{ position: "fixed", right: 18, bottom: 84, pointerEvents: "none", zIndex: 1150, maxWidth: 340, padding: "10px 13px", borderRadius: 9, border: "1px solid rgba(110,170,255,0.34)", background: "rgba(20,25,34,0.96)", color: "rgba(255,255,255,0.88)", fontSize: 13, boxShadow: "0 10px 32px rgba(0,0,0,0.35)" }}
      >
        {workspaceNotice}
      </div>
    )}
    </>
  );
});

DrawingCanvas.displayName = "DrawingCanvas";
