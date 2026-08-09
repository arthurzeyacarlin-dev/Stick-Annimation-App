import { memo, startTransition, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { DrawingCanvas } from "./DrawingCanvas";
import type {
  DrawingCanvasHandle,
  DrawingCanvasPlaybackSurfaceLayout,
  DrawingCanvasSnapshot,
  DrawingCanvasSnapshotOptions,
} from "./DrawingCanvas";
import {
  cloneDrawingTextObjects,
  DEFAULT_DRAWING_TEXT_COLOR,
  DEFAULT_DRAWING_TEXT_FONT,
  drawScaledDrawingTextObject,
  drawingTextObjectsEqual,
  normalizeDrawingTextRotation,
  type DrawingTextObject,
} from "./drawingText";
import { DrawingToolBar } from "./DrawingToolBar";
import type { DrawingShapeType, DrawingToolName } from "./DrawingToolBar";
import { DrawingTimelineRow } from "./DrawingTimelineRow";
import type { TimelineFrame, TimelineFrameCellType, TimelineFrameKind, TimelineLayer } from "./DrawingTimelineRow";
import { DrawingTopBar } from "./DrawingTopBar";
import {
  advancePlaybackAccumulator,
  getAuthoredPlaybackFrameCount,
  getClampedPlaybackFrameDurationMs,
  resolvePlaybackRenderScale,
  resolveSafeGeneratedSequenceFps,
  shouldSyncPlaybackUiState,
} from "./timelinePlayback";
import { collapseTimelineRange } from "./timelineStructure";
import {
  saveStoredDrawingProject,
  updateStoredDrawingProjectAiMemory,
  type DrawingProjectData,
  type SerializedBitmap,
  type StoredDrawingSoundAttachment,
  type StoredDrawingProject,
  type StoredDrawingTextObject,
  type StoredDrawingTimelineFrame,
  type StoredMotionTweenData,
} from "@/src/lib/drawingProjectStorage";
import type {
  DrawingAiActionPlan,
  DrawingAiProjectMemory,
  DrawingAiSoundOption,
  DrawingAiWorkspaceContext,
} from "@/src/lib/ai/drawingAiContract";
import {
  bindDrawingAiProjectMemoryToProject,
  chooseNewerDrawingAiProjectMemory,
} from "@/src/lib/ai/drawingAiProjectMemory";
import type { GeneratedFrameRenderResult } from "@/src/lib/ai/drawingFrameExecutor";
import {
  deleteDrawingProjectAiMemoryFromSupabase,
  loadDrawingProjectAiMemoryFromSupabase,
  saveDrawingProjectAiMemoryToSupabase,
} from "@/src/lib/ai/drawingProjectAiMemorySync";
import { isVoiceLikeSoundOption, synthesizeSoundOptionToDataUrl } from "@/src/lib/ai/drawingSoundSynthesis";
import { isSoundGenerationEnabled, SOUND_GENERATION_DISABLED_MESSAGE } from "@/src/lib/ai/drawingSoundAvailability";
import {
  FRAME_GENERATION_DEBOUNCE_MS,
  MAX_FRAMES_PER_REQUEST,
} from "@/src/lib/ai/frameGenerationSafety";

type TimelineFrameSnapshot = {
  bitmap: ImageData | null;
  previewUrl: string | null | undefined;
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

type TweenEndpointSnapshot = {
  tweenEndBitmap: ImageData | null;
  tweenEndPreviewUrl: string | null;
};

type MotionTweenOrigin = {
  x: number;
  y: number;
};

type MotionTweenData = {
  mode: "position";
  stageWidth: number;
  stageHeight: number;
  spriteBitmap: ImageData | null;
  startOrigin: MotionTweenOrigin | null;
  endOrigin: MotionTweenOrigin | null;
};

type WorkspaceSoundAttachment = {
  id: string;
  title: string;
  description: string;
  timingFeel: string | null;
  intensityFeel: string | null;
  audioDataUrl: string | null;
  contentType: "sfx" | "voice-placeholder";
  speechText: string | null;
  sourceTask: "generate-sounds";
  attachedAt: string;
};

type WorkspaceTimelineFrame = TimelineFrame &
  TimelineFrameSnapshot &
  TweenEndpointSnapshot & {
    motionTween: MotionTweenData | null;
    soundAttachment: WorkspaceSoundAttachment | null;
    textObjects: DrawingTextObject[];
  };

type WorkspaceLayer = {
  id: string;
  name: string;
  orderIndex: number;
  timelineFrames: WorkspaceTimelineFrame[];
};

type CanvasOverlayRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type OnionFramePreview = {
  bitmap: ImageData | null;
  textObjects: DrawingTextObject[];
};

type PlaybackSurfaceMetrics = {
  canvasWidth: number;
  canvasHeight: number;
  drawingCanvasWidth: number | null;
  drawingCanvasHeight: number | null;
  worldWidth: number;
  worldHeight: number;
  cssWidth: number;
  cssHeight: number;
  worldDisplayRect: CanvasOverlayRect;
  stageDisplayRect: CanvasOverlayRect | null;
  hostBackgroundColor: string;
  stageBackgroundColor: string;
};

type PlaybackReturnState = {
  currentFrameIndex: number;
  selectedTimelineIndex: number;
  activeLayerId: string;
};

type TweenGuide = {
  startIndex: number;
  endIndex: number;
  stageWidth: number;
  stageHeight: number;
  startBounds: BitmapBounds;
  endBounds: BitmapBounds;
};

type TweenEditContext = {
  layerId: string;
  stateId: number;
  side: "start" | "end";
  ownerIndex: number;
  spanStartIndex: number;
  spanEndIndex: number;
};

type TweenSpanResolution = {
  ownerIndex: number;
  ownerFrame: WorkspaceTimelineFrame;
  tweenFrameIndex: number;
  spanStartIndex: number;
  spanEndIndex: number;
  hasSavedEndBitmap: boolean;
  hasPlaybackValidEndpoint: boolean;
};

type MotionTweenOwnerValidityReason =
  | "missing_tween_span"
  | "missing_saved_end_bitmap"
  | "saved_end_bitmap_not_playback_valid"
  | "missing_motion_payload"
  | "missing_sprite_bitmap"
  | "missing_start_origin"
  | "missing_end_origin"
  | "invalid_stage_dimensions";

type MotionTweenOwnerValidity = {
  isValid: boolean;
  reason: MotionTweenOwnerValidityReason | null;
  ownerFrame: WorkspaceTimelineFrame | null;
  motionTween: MotionTweenData | null;
  tweenSpan: TweenSpanResolution | null;
  debugMeta: Record<string, unknown>;
};

type FrozenTweenPlaybackDescriptor = {
  layerId: string;
  ownerIndex: number;
  stateId: number;
  stageWidth: number;
  stageHeight: number;
  spriteCanvas: HTMLCanvasElement;
  spriteWidth: number;
  spriteHeight: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  renderCanvas: HTMLCanvasElement;
  renderCtx: CanvasRenderingContext2D;
};

type FrozenTweenPlaybackCache = Map<string, FrozenTweenPlaybackDescriptor>;

type MotionTweenBuildResult =
  | {
      status: "success";
      reason: string;
      motionTween: MotionTweenData;
      debugMeta?: Record<string, unknown>;
    }
  | {
      status: "clear";
      reason: string;
      motionTween: MotionTweenData | null;
      debugMeta?: Record<string, unknown>;
    }
  | {
      status: "invalid";
      reason: string;
      motionTween?: MotionTweenData | null;
      debugMeta?: Record<string, unknown>;
    };

type FrozenTweenPlaybackDescriptorResult =
  | {
      status: "success";
      descriptor: FrozenTweenPlaybackDescriptor;
    }
  | {
      status: "invalid";
      reason: string;
      debugMeta?: Record<string, unknown>;
    };

type PlaybackResolutionSource =
  | "non_tween_bitmap"
  | "frozen_tween_descriptor"
  | "recovered_motion_descriptor"
  | "invalid_motion_tween"
  | "null";

type PlaybackBitmapResolution = {
  bitmap: ImageData | null;
  drawSource: HTMLCanvasElement | null;
  textObjects: DrawingTextObject[];
  renderSource: PlaybackResolutionSource;
  debugMeta?: Record<string, unknown>;
};

type DrawingWorkspaceInitialState = {
  projectId: string | null;
  projectTitle: string;
  activeTool: DrawingToolName;
  brushSize: number;
  eraserSize: number;
  fillColor: string;
  timelineFps: number;
  shapeType: DrawingShapeType;
  layers: WorkspaceLayer[];
  activeLayerId: string;
  currentFrameIndex: number;
  selectedTimelineIndex: number;
  isOnionEnabled: boolean;
  nextTimelineFrameId: number;
  nextLayerNumber: number;
};

type DrawingWorkspaceHistoryEntry = {
  layers: WorkspaceLayer[];
  activeLayerId: string;
  currentFrameIndex: number;
  selectedTimelineIndex: number;
  nextTimelineFrameId: number;
  nextLayerNumber: number;
  owner: DrawingWorkspaceHistoryOwner;
};

type DrawingWorkspaceHistoryOwner =
  | {
      kind: "global";
    }
  | {
      kind: "local-drawing";
      contextKey: string;
      layerId: string;
      viewFrameId: number;
      targetFrameId: number;
      target: "bitmap" | "tweenEndBitmap";
    };

type WorkspaceTimelineFrameMetadata = {
  id: number;
  kind: TimelineFrameKind;
  cellType: TimelineFrameCellType;
  stateId: number;
  isBlank: boolean;
  hasTweenEndpoint: boolean;
  previewUrl: string | null;
  tweenEndPreviewUrl: string | null;
  motionTween: MotionTweenData | null;
  soundAttachment: WorkspaceSoundAttachment | null;
  textObjects: DrawingTextObject[];
};

type LocalDrawingHistoryContext = {
  key: string;
  layerId: string;
  viewFrameId: number;
  targetFrameId: number;
  target: "bitmap" | "tweenEndBitmap";
};

type LocalDrawingHistoryEntryBase = {
  contextKey: string;
  layerId: string;
  viewFrameId: number;
  targetFrameId: number;
  target: "bitmap" | "tweenEndBitmap";
  beforeFrameMeta: WorkspaceTimelineFrameMetadata;
  afterFrameMeta: WorkspaceTimelineFrameMetadata;
};

type LocalDrawingPatchHistoryEntry = LocalDrawingHistoryEntryBase & {
  kind: "patch";
  bitmapWidth: number;
  bitmapHeight: number;
  patchRect: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  beforePatchBitmap: ImageData;
  afterPatchBitmap: ImageData;
};

type LocalDrawingSnapshotHistoryEntry = LocalDrawingHistoryEntryBase & {
  kind: "snapshot";
  beforeBitmap: ImageData | null;
  afterBitmap: ImageData | null;
};

type LocalDrawingMetadataHistoryEntry = LocalDrawingHistoryEntryBase & {
  kind: "metadata";
};

type LocalTimelineFramesHistoryEntry = {
  kind: "timeline-snapshot";
  contextKey: string;
  layerId: string;
  viewFrameId: number;
  targetFrameId: number;
  target: "bitmap" | "tweenEndBitmap";
  beforeFrames: WorkspaceTimelineFrame[];
  afterFrames: WorkspaceTimelineFrame[];
};

type LocalDrawingHistoryEntry =
  | LocalDrawingPatchHistoryEntry
  | LocalDrawingSnapshotHistoryEntry
  | LocalDrawingMetadataHistoryEntry
  | LocalTimelineFramesHistoryEntry;

type LocalDrawingHistoryStack = {
  entries: LocalDrawingHistoryEntry[];
  position: number;
  blocksGlobalTraversal: boolean;
};

type CopiedTimelineFrame = {
  sourceLayerId: string;
  cellType: "keyframe" | "blank-keyframe";
  snapshot: TimelineFrameSnapshot;
  soundAttachment: WorkspaceSoundAttachment | null;
  textObjects: DrawingTextObject[];
};

type CanvasAuthoringActionReason = "stroke" | "shape" | "placed-asset" | "clear-canvas" | "knife" | "selection";

const MemoizedDrawingTimelineRow = memo(DrawingTimelineRow);
const MemoizedDrawingCanvas = memo(DrawingCanvas);

const timelineFrameSoundAttachmentId = (frame: Pick<WorkspaceTimelineFrame, "soundAttachment"> | TimelineFrame) =>
  frame.soundAttachment?.id ?? null;

const timelineFrameMatchesRowView = (frame: WorkspaceTimelineFrame, rowFrame: TimelineFrame) =>
  frame.id === rowFrame.id &&
  frame.kind === rowFrame.kind &&
  frame.cellType === rowFrame.cellType &&
  frame.stateId === rowFrame.stateId &&
  Boolean(frame.isBlank) === Boolean(rowFrame.isBlank) &&
  Boolean(frame.hasTweenEndpoint) === Boolean(rowFrame.hasTweenEndpoint) &&
  timelineFrameSoundAttachmentId(frame) === timelineFrameSoundAttachmentId(rowFrame);

const createTimelineRowFrameView = (frame: WorkspaceTimelineFrame): TimelineFrame => ({
  id: frame.id,
  kind: frame.kind,
  cellType: frame.cellType,
  stateId: frame.stateId,
  isBlank: frame.isBlank,
  hasTweenEndpoint: frame.hasTweenEndpoint,
  soundAttachment: frame.soundAttachment ? { id: frame.soundAttachment.id } : null,
});

const getAuthoredPlaybackFrameCountForTimelineLayers = (layers: ReadonlyArray<TimelineLayer>) =>
  getAuthoredPlaybackFrameCount(layers.map((layer) => layer.frames));

const EMPTY_TIMELINE_FRAMES: WorkspaceTimelineFrame[] = [];
const EMPTY_DRAWING_TEXT_OBJECTS: DrawingTextObject[] = [];
const ENABLE_MOTION_TWEEN_DEBUG =
  process.env.NEXT_PUBLIC_ENABLE_MOTION_TWEEN_DEBUG === "true" || process.env.NODE_ENV === "test";
const ENABLE_AI_PLAYBACK_DEBUG =
  process.env.NEXT_PUBLIC_ENABLE_AI_PLAYBACK_DEBUG === "true" || process.env.NODE_ENV === "test";
const SAVE_PATH_ALPHA_THRESHOLD = 0;
const DEFAULT_PROJECT_TITLE = "Unnamed drawing project";
const DEFAULT_INITIAL_LAYER_ID = "layer-1";
const BACKGROUND_LAYER_NAME_PATTERN = /\b(background|backdrop|environment|sky|bg)\b/i;
const STORED_FRAME_IMAGE_MAX_LENGTH = 72_000;
const STORED_FRAME_IMAGE_MAX_DIMENSION = 1280;
const LIVE_FRAME_PREVIEW_MAX_LENGTH = 32_000;
const LIVE_FRAME_PREVIEW_MAX_DIMENSION = 512;
const PROJECT_PREVIEW_WIDTH = 92;
const PROJECT_PREVIEW_HEIGHT = 68;
const PROJECT_PREVIEW_MAX_LENGTH = 18_000;
const MAX_GLOBAL_HISTORY_ENTRIES = 160;
const WORKSPACE_HOST_BACKGROUND_FALLBACK = "rgb(34, 36, 47)";
const WORKSPACE_STAGE_BACKGROUND_FALLBACK = "#f5f5f5";
const POINTERUP_AUTOSAVE_IDLE_TIMEOUT_MS = 320;
const MAX_BITMAP_DATA_LENGTH = 256 * 1024 * 1024;

const getExpectedBitmapDataLength = (width: number, height: number) => {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    return null;
  }

  const expectedLength = width * height * 4;
  if (!Number.isSafeInteger(expectedLength) || expectedLength <= 0 || expectedLength > MAX_BITMAP_DATA_LENGTH) {
    return null;
  }

  return expectedLength;
};

const isBitmapDataShapeValid = (bitmap: { width: number; height: number; data: { length: number } } | null | undefined) => {
  if (!bitmap) {
    return false;
  }

  const expectedLength = getExpectedBitmapDataLength(bitmap.width, bitmap.height);
  return expectedLength !== null && bitmap.data.length >= expectedLength;
};

const createImageDataSafely = (
  data: Uint8ClampedArray | number[],
  width: number,
  height: number,
): ImageData | null => {
  const expectedLength = getExpectedBitmapDataLength(width, height);
  if (expectedLength === null || data.length !== expectedLength) {
    return null;
  }

  const nextData =
    data instanceof Uint8ClampedArray
      ? new Uint8ClampedArray(data)
      : Uint8ClampedArray.from(data);

  try {
    return new ImageData(nextData, width, height);
  } catch {
    return null;
  }
};

const getUsableBitmap = (bitmap: ImageData | null) => (isBitmapDataShapeValid(bitmap) ? bitmap : null);

const cloneBitmap = (bitmap: ImageData | null) => {
  const usableBitmap = getUsableBitmap(bitmap);
  if (!usableBitmap) {
    return null;
  }

  return createImageDataSafely(usableBitmap.data, usableBitmap.width, usableBitmap.height);
};

const bitmapCanvasCache = new WeakMap<ImageData, HTMLCanvasElement>();
const bitmapLivePreviewUrlCache = new WeakMap<ImageData, string | null>();
const bitmapStoredPreviewUrlCache = new WeakMap<ImageData, string | null>();

const invalidateBitmapRenderCaches = (bitmap: ImageData | null) => {
  if (!bitmap) {
    return;
  }

  bitmapCanvasCache.delete(bitmap);
  bitmapLivePreviewUrlCache.delete(bitmap);
  bitmapStoredPreviewUrlCache.delete(bitmap);
};

const cloneMotionTweenOrigin = (origin: MotionTweenOrigin | null) => (origin ? { ...origin } : null);

const cloneMotionTweenData = (motionTween: MotionTweenData | null): MotionTweenData | null =>
  motionTween
    ? {
        mode: motionTween.mode,
        stageWidth: motionTween.stageWidth,
        stageHeight: motionTween.stageHeight,
        spriteBitmap: cloneBitmap(motionTween.spriteBitmap),
        startOrigin: cloneMotionTweenOrigin(motionTween.startOrigin),
        endOrigin: cloneMotionTweenOrigin(motionTween.endOrigin),
      }
    : null;

const normalizeStoredDrawingTextObject = (
  textObject: StoredDrawingTextObject | DrawingTextObject,
): DrawingTextObject => {
  const fontFamily = (
    textObject.fontFamily === "Verdana" ||
    textObject.fontFamily === "Georgia" ||
    textObject.fontFamily === "Times New Roman" ||
    textObject.fontFamily === "Courier New"
  )
    ? textObject.fontFamily
    : DEFAULT_DRAWING_TEXT_FONT;

  return {
    id: textObject.id,
    text: textObject.text,
    x: textObject.x,
    y: textObject.y,
    width: Math.max(32, textObject.width),
    flipX: Boolean((textObject as DrawingTextObject | StoredDrawingTextObject).flipX),
    flipY: Boolean((textObject as DrawingTextObject | StoredDrawingTextObject).flipY),
    rotation: normalizeDrawingTextRotation((textObject as DrawingTextObject | StoredDrawingTextObject).rotation ?? 0),
    fontFamily,
    fontSize: Math.max(10, textObject.fontSize),
    color: /^#[0-9a-fA-F]{6}$/.test(textObject.color) ? textObject.color : DEFAULT_DRAWING_TEXT_COLOR,
    bold: Boolean(textObject.bold),
    italic: Boolean(textObject.italic),
  };
};

const serializeTextObject = (textObject: DrawingTextObject): StoredDrawingTextObject => ({
  ...normalizeStoredDrawingTextObject(textObject),
});

const cloneWorkspaceTextObjects = (textObjects: DrawingTextObject[]) => cloneDrawingTextObjects(textObjects);

const cloneWorkspaceTimelineFrame = (frame: WorkspaceTimelineFrame): WorkspaceTimelineFrame => ({
  ...frame,
  bitmap: cloneBitmap(frame.bitmap),
  previewUrl: frame.previewUrl ?? null,
  tweenEndBitmap: cloneBitmap(frame.tweenEndBitmap),
  tweenEndPreviewUrl: frame.tweenEndPreviewUrl ?? null,
  motionTween: cloneMotionTweenData(frame.motionTween),
  soundAttachment: frame.soundAttachment ? { ...frame.soundAttachment } : null,
  textObjects: cloneWorkspaceTextObjects(frame.textObjects),
});

const cloneWorkspaceTimelineFrameMetadata = (frame: WorkspaceTimelineFrame): WorkspaceTimelineFrameMetadata => ({
  id: frame.id,
  kind: frame.kind,
  cellType: frame.cellType,
  stateId: frame.stateId,
  isBlank: Boolean(frame.isBlank),
  hasTweenEndpoint: Boolean(frame.hasTweenEndpoint),
  previewUrl: frame.previewUrl ?? null,
  tweenEndPreviewUrl: frame.tweenEndPreviewUrl ?? null,
  motionTween: cloneMotionTweenData(frame.motionTween),
  soundAttachment: frame.soundAttachment ? { ...frame.soundAttachment } : null,
  textObjects: cloneWorkspaceTextObjects(frame.textObjects),
});

const cloneWorkspaceLayer = (layer: WorkspaceLayer): WorkspaceLayer => ({
  ...layer,
  timelineFrames: layer.timelineFrames.map(cloneWorkspaceTimelineFrame),
});

const cloneWorkspaceTimelineFrames = (frames: WorkspaceTimelineFrame[]) => frames.map(cloneWorkspaceTimelineFrame);

const isBackgroundWorkspaceLayer = (layer: WorkspaceLayer | null | undefined) =>
  Boolean(layer && BACKGROUND_LAYER_NAME_PATTERN.test(layer.name));

const cloneWorkspaceLayers = (layers: WorkspaceLayer[]) => layers.map(cloneWorkspaceLayer);

const findBitmapBoundsWithAlphaThreshold = (bitmap: ImageData | null, alphaThreshold: number): BitmapBounds | null => {
  if (!bitmap) return null;

  let minX = bitmap.width;
  let minY = bitmap.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < bitmap.height; y += 1) {
    for (let x = 0; x < bitmap.width; x += 1) {
      const alpha = bitmap.data[(y * bitmap.width + x) * 4 + 3];
      if (alpha <= alphaThreshold) {
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

const findSavePathBitmapBounds = (bitmap: ImageData | null) => findBitmapBoundsWithAlphaThreshold(bitmap, SAVE_PATH_ALPHA_THRESHOLD);

const isBitmapEmpty = (bitmap: ImageData | null) => {
  if (!bitmap) {
    return true;
  }

  for (let index = 3; index < bitmap.data.length; index += 4) {
    if (bitmap.data[index] > SAVE_PATH_ALPHA_THRESHOLD) {
      return false;
    }
  }

  return true;
};

const hasSnapshotDirtyPatch = (
  snapshot?: TimelineFrameSnapshot | DrawingCanvasSnapshot | WorkspaceTimelineFrame | null,
): snapshot is (
  TimelineFrameSnapshot & {
    dirtyPatchBitmap: ImageData;
    dirtyPatchRect: { left: number; top: number; width: number; height: number };
    bitmapWidth: number;
    bitmapHeight: number;
  }
) => {
  if (!snapshot?.dirtyPatchBitmap || !snapshot.dirtyPatchRect) {
    return false;
  }

  const { left, top, width, height } = snapshot.dirtyPatchRect;
  const bitmapWidth = snapshot.bitmapWidth ?? snapshot.dirtyPatchBitmap.width;
  const bitmapHeight = snapshot.bitmapHeight ?? snapshot.dirtyPatchBitmap.height;
  const expectedLength = getExpectedBitmapDataLength(width, height);

  return (
    getExpectedBitmapDataLength(bitmapWidth, bitmapHeight) !== null &&
    expectedLength !== null &&
    snapshot.dirtyPatchBitmap.width === width &&
    snapshot.dirtyPatchBitmap.height === height &&
    snapshot.dirtyPatchBitmap.data.length >= expectedLength &&
    left >= 0 &&
    top >= 0 &&
    left + width <= bitmapWidth &&
    top + height <= bitmapHeight
  );
};

const applyBitmapPatch = (
  target: ImageData,
  patch: ImageData,
  rect: { left: number; top: number; width: number; height: number },
) => {
  const rowWidth = rect.width * 4;
  for (let row = 0; row < rect.height; row += 1) {
    const sourceStart = row * rowWidth;
    const targetStart = ((rect.top + row) * target.width + rect.left) * 4;
    target.data.set(patch.data.subarray(sourceStart, sourceStart + rowWidth), targetStart);
  }
};

const captureBitmapPatch = (
  sourceBitmap: ImageData | null,
  rect: { left: number; top: number; width: number; height: number },
): ImageData => {
  const expectedLength = getExpectedBitmapDataLength(rect.width, rect.height);
  if (expectedLength === null) {
    return new ImageData(1, 1);
  }

  const patch = new Uint8ClampedArray(expectedLength);
  const usableSourceBitmap = getUsableBitmap(sourceBitmap);
  if (usableSourceBitmap) {
    const rowWidth = rect.width * 4;
    for (let row = 0; row < rect.height; row += 1) {
      const sourceStart = ((rect.top + row) * usableSourceBitmap.width + rect.left) * 4;
      const targetStart = row * rowWidth;
      patch.set(usableSourceBitmap.data.subarray(sourceStart, sourceStart + rowWidth), targetStart);
    }
  }

  return new ImageData(patch, rect.width, rect.height);
};

const snapshotBitmapMatches = (
  currentBitmap: ImageData | null,
  snapshot?: TimelineFrameSnapshot | DrawingCanvasSnapshot | WorkspaceTimelineFrame | null,
) => {
  if (hasSnapshotDirtyPatch(snapshot)) {
    if (
      currentBitmap &&
      (currentBitmap.width !== snapshot.bitmapWidth || currentBitmap.height !== snapshot.bitmapHeight)
    ) {
      return false;
    }

    const { dirtyPatchBitmap, dirtyPatchRect } = snapshot;
    const rowWidth = dirtyPatchRect.width * 4;
    for (let row = 0; row < dirtyPatchRect.height; row += 1) {
      const sourceStart = row * rowWidth;
      const targetStart = currentBitmap
        ? ((dirtyPatchRect.top + row) * currentBitmap.width + dirtyPatchRect.left) * 4
        : -1;

      for (let index = 0; index < rowWidth; index += 1) {
        const currentValue = targetStart >= 0 ? currentBitmap!.data[targetStart + index] : 0;
        if (currentValue !== dirtyPatchBitmap.data[sourceStart + index]) {
          return false;
        }
      }
    }

    return true;
  }

  return bitmapsEqual(currentBitmap, snapshot?.bitmap ?? null);
};

const materializeSnapshotBitmap = (
  snapshot: TimelineFrameSnapshot | DrawingCanvasSnapshot | WorkspaceTimelineFrame | null | undefined,
  currentBitmap: ImageData | null,
  options?: { mutateCurrentBitmap?: boolean },
): ImageData | null => {
  if (hasSnapshotDirtyPatch(snapshot)) {
    const usableDirtyPatchBitmap = getUsableBitmap(snapshot.dirtyPatchBitmap);
    if (!usableDirtyPatchBitmap || getExpectedBitmapDataLength(snapshot.bitmapWidth, snapshot.bitmapHeight) === null) {
      return null;
    }

    const patchCoversWholeBitmap =
      snapshot.dirtyPatchRect.left === 0 &&
      snapshot.dirtyPatchRect.top === 0 &&
      snapshot.dirtyPatchRect.width === snapshot.bitmapWidth &&
      snapshot.dirtyPatchRect.height === snapshot.bitmapHeight;
    if (patchCoversWholeBitmap) {
      return usableDirtyPatchBitmap;
    }

    let targetBitmap: ImageData;
    const usableCurrentBitmap =
      getUsableBitmap(currentBitmap) &&
      currentBitmap!.width === snapshot.bitmapWidth &&
      currentBitmap!.height === snapshot.bitmapHeight
        ? currentBitmap
        : null;
    if (usableCurrentBitmap) {
      targetBitmap = options?.mutateCurrentBitmap ? usableCurrentBitmap : cloneBitmap(usableCurrentBitmap)!;
    } else {
      const blankBitmap = createImageDataSafely(
        new Uint8ClampedArray(snapshot.bitmapWidth * snapshot.bitmapHeight * 4),
        snapshot.bitmapWidth,
        snapshot.bitmapHeight,
      );
      if (!blankBitmap) {
        return null;
      }
      targetBitmap = blankBitmap;
    }

    applyBitmapPatch(targetBitmap, usableDirtyPatchBitmap, snapshot.dirtyPatchRect);
    return targetBitmap;
  }

  return getUsableBitmap(snapshot?.bitmap ?? null);
};

const adoptSnapshot = (
  snapshot?: TimelineFrameSnapshot | WorkspaceTimelineFrame | null,
  options?: { isolateBitmap?: boolean },
): TimelineFrameSnapshot => {
  const materializedBitmap = materializeSnapshotBitmap(snapshot, null);
  const bitmap = options?.isolateBitmap ? cloneBitmap(materializedBitmap) : materializedBitmap;

  if (isBitmapEmpty(bitmap)) {
    return {
      bitmap: null,
      previewUrl: null,
    };
  }

  return {
    bitmap,
    previewUrl: snapshot ? snapshot.previewUrl : null,
  };
};

const resolveSnapshotPreviewUrl = ({
  nextPreviewUrl,
  existingPreviewUrl,
  didBitmapChange,
}: {
  nextPreviewUrl: string | null | undefined;
  existingPreviewUrl: string | null | undefined;
  didBitmapChange: boolean;
}) => {
  if (nextPreviewUrl !== undefined) {
    return nextPreviewUrl ?? null;
  }

  return didBitmapChange ? null : (existingPreviewUrl ?? null);
};

const isFrameStateStart = (frame?: Pick<TimelineFrame, "cellType"> | null) =>
  frame?.cellType === "keyframe" || frame?.cellType === "blank-keyframe";

const isEmptyTimelineSlot = (frame?: Pick<TimelineFrame, "cellType"> | null) =>
  !frame || frame.cellType === "empty" || frame.cellType === "blank-keyframe";

const canFrameOwnSnapshot = (frame?: Pick<TimelineFrame, "cellType"> | null) =>
  !!frame && frame.cellType !== "empty" && (isFrameStateStart(frame) || frame.cellType === "tween");

const createTimelineFrame = (
  id: number,
  kind: TimelineFrameKind,
  cellType: TimelineFrameCellType,
  stateId: number,
  snapshot?: TimelineFrameSnapshot | null,
): WorkspaceTimelineFrame => {
  const isolatedSnapshot =
    cellType === "blank-keyframe"
      ? { bitmap: null, previewUrl: null }
      : canFrameOwnSnapshot({ cellType })
        ? adoptSnapshot(snapshot)
        : { bitmap: null, previewUrl: null };

  return {
    id,
    kind,
    cellType,
    stateId,
    isBlank: cellType === "blank-keyframe",
    hasTweenEndpoint: false,
    bitmap: isolatedSnapshot.bitmap,
    previewUrl: isolatedSnapshot.previewUrl ?? null,
    tweenEndBitmap: null,
    tweenEndPreviewUrl: null,
    motionTween: null,
    soundAttachment: null,
    textObjects: [],
  };
};

const createEmptyTimelineFrame = (id: number): WorkspaceTimelineFrame => createTimelineFrame(id, "frame", "empty", id);

const serializeBitmap = (bitmap: ImageData | null): SerializedBitmap | null => {
  const usableBitmap = getUsableBitmap(bitmap);
  return usableBitmap
    ? {
        width: usableBitmap.width,
        height: usableBitmap.height,
        data: Array.from(usableBitmap.data),
      }
    : null;
};

const deserializeBitmap = (bitmap: SerializedBitmap | null | undefined) => {
  if (!bitmap) {
    return null;
  }

  return createImageDataSafely(bitmap.data, bitmap.width, bitmap.height);
};

const serializeMotionTweenData = (motionTween: MotionTweenData | null): StoredMotionTweenData | null =>
  motionTween
    ? {
        mode: motionTween.mode,
        stageWidth: motionTween.stageWidth,
        stageHeight: motionTween.stageHeight,
        spriteBitmap: serializeBitmap(motionTween.spriteBitmap),
        startOrigin: cloneMotionTweenOrigin(motionTween.startOrigin),
        endOrigin: cloneMotionTweenOrigin(motionTween.endOrigin),
      }
    : null;

const deserializeMotionTweenData = (motionTween: StoredMotionTweenData | null | undefined): MotionTweenData | null =>
  motionTween
    ? {
        mode: motionTween.mode,
        stageWidth: motionTween.stageWidth,
        stageHeight: motionTween.stageHeight,
        spriteBitmap: deserializeBitmap(motionTween.spriteBitmap),
        startOrigin: cloneMotionTweenOrigin(motionTween.startOrigin),
        endOrigin: cloneMotionTweenOrigin(motionTween.endOrigin),
      }
    : null;

const serializeSoundAttachment = (soundAttachment: WorkspaceSoundAttachment | null): StoredDrawingSoundAttachment | null =>
  soundAttachment ? { ...soundAttachment } : null;

const deserializeSoundAttachment = (
  soundAttachment: StoredDrawingSoundAttachment | null | undefined,
): WorkspaceSoundAttachment | null =>
  soundAttachment
    ? {
        ...soundAttachment,
        timingFeel: soundAttachment.timingFeel ?? null,
        intensityFeel: soundAttachment.intensityFeel ?? null,
        audioDataUrl: soundAttachment.audioDataUrl ?? null,
        contentType: soundAttachment.contentType === "voice-placeholder" ? "voice-placeholder" : "sfx",
        speechText: soundAttachment.speechText ?? null,
      }
    : null;

const serializeTimelineFrame = (frame: WorkspaceTimelineFrame): StoredDrawingTimelineFrame => ({
  id: frame.id,
  kind: frame.kind,
  cellType: frame.cellType,
  stateId: frame.stateId,
  isBlank: frame.isBlank,
  hasTweenEndpoint: frame.hasTweenEndpoint,
  bitmap: null,
  previewUrl:
    frame.cellType === "blank-keyframe" ? null : (createStoredBitmapPreviewUrl(frame.bitmap) ?? frame.previewUrl ?? null),
  tweenEndBitmap: null,
  tweenEndPreviewUrl:
    frame.cellType === "blank-keyframe"
      ? null
      : (createStoredBitmapPreviewUrl(frame.tweenEndBitmap) ?? frame.tweenEndPreviewUrl ?? null),
  motionTween: serializeMotionTweenData(frame.motionTween),
  soundAttachment: serializeSoundAttachment(frame.soundAttachment),
  textObjects: frame.cellType === "blank-keyframe" ? [] : frame.textObjects.map(serializeTextObject),
});

const deserializeTimelineFrame = (frame: StoredDrawingTimelineFrame): WorkspaceTimelineFrame => {
  const isBlankKeyframe = frame.isBlank === true || frame.cellType === "blank-keyframe";

  return {
    id: frame.id,
    kind: frame.kind,
    cellType: frame.cellType,
    stateId: frame.stateId,
    isBlank: isBlankKeyframe,
    hasTweenEndpoint: Boolean(frame.hasTweenEndpoint),
    bitmap: isBlankKeyframe ? null : deserializeBitmap(frame.bitmap),
    previewUrl: isBlankKeyframe ? null : (frame.previewUrl ?? null),
    tweenEndBitmap: isBlankKeyframe ? null : deserializeBitmap(frame.tweenEndBitmap),
    tweenEndPreviewUrl: isBlankKeyframe ? null : (frame.tweenEndPreviewUrl ?? null),
    motionTween: isBlankKeyframe ? null : deserializeMotionTweenData(frame.motionTween),
    soundAttachment: isBlankKeyframe ? null : deserializeSoundAttachment(frame.soundAttachment),
    textObjects: isBlankKeyframe ? [] : (frame.textObjects ?? []).map(normalizeStoredDrawingTextObject),
  };
};

const createDefaultWorkspaceLayers = (): WorkspaceLayer[] => [
  {
    id: DEFAULT_INITIAL_LAYER_ID,
    name: "Layer 1",
    orderIndex: 0,
    timelineFrames: [createTimelineFrame(1, "keyframe", "keyframe", 1)],
  },
];

const getMaxTimelineFrameId = (layers: WorkspaceLayer[]) =>
  layers.reduce(
    (highestFrameId, layer) =>
      Math.max(highestFrameId, ...layer.timelineFrames.map((frame) => frame.id)),
    0,
  );

const getNextLayerNumber = (layers: WorkspaceLayer[]) =>
  Math.max(
    2,
    ...layers.map((layer) => {
      const match = layer.id.match(/layer-(\d+)/);
      return match ? Number(match[1]) + 1 : 1;
    }),
  );

const createDefaultDrawingWorkspaceState = (
  projectTitle = DEFAULT_PROJECT_TITLE,
): DrawingWorkspaceInitialState => {
  const layers = createDefaultWorkspaceLayers();

  return {
    projectId: null,
    projectTitle,
    activeTool: "Select",
    brushSize: 4,
    eraserSize: 12,
    fillColor: "#000000",
    timelineFps: 12,
    shapeType: "Square",
    layers,
    activeLayerId: layers[0].id,
    currentFrameIndex: 0,
    selectedTimelineIndex: 0,
    isOnionEnabled: false,
    nextTimelineFrameId: getMaxTimelineFrameId(layers) + 1,
    nextLayerNumber: getNextLayerNumber(layers),
  };
};

const createDrawingWorkspaceInitialState = (
  project?: StoredDrawingProject | null,
): DrawingWorkspaceInitialState => {
  if (!project) {
    return createDefaultDrawingWorkspaceState();
  }

  const loadedLayers = normalizeLayerOrder(
    (project.data.layers ?? []).map((layer) => ({
      id: layer.id,
      name: layer.name,
      orderIndex: layer.orderIndex,
      timelineFrames: (layer.timelineFrames ?? []).map(deserializeTimelineFrame),
    })),
  );
  const layers = loadedLayers.length > 0 ? loadedLayers : createDefaultWorkspaceLayers();
  const activeLayer = getLayerById(layers, project.data.activeLayerId) ?? layers[0];
  const maxTimelineIndex = Math.max(0, getGlobalTimelineFrameCount(layers) - 1);
  const highestTimelineFrameId = getMaxTimelineFrameId(layers);
  const nextTimelineFrameId = Math.max(project.data.nextTimelineFrameId ?? 0, highestTimelineFrameId + 1);

  return {
    projectId: project.id,
    projectTitle: project.name || DEFAULT_PROJECT_TITLE,
    activeTool: project.data.activeTool ?? "Select",
    brushSize: project.data.brushSize ?? 4,
    eraserSize: project.data.eraserSize ?? 12,
    fillColor: project.data.fillColor ?? "#000000",
    timelineFps: project.data.timelineFps ?? 12,
    shapeType: project.data.shapeType ?? "Square",
    layers,
    activeLayerId: activeLayer?.id ?? layers[0].id,
    currentFrameIndex: Math.max(0, Math.min(project.data.currentFrameIndex ?? 0, maxTimelineIndex)),
    selectedTimelineIndex: Math.max(0, Math.min(project.data.selectedTimelineIndex ?? 0, maxTimelineIndex)),
    isOnionEnabled: Boolean(project.data.isOnionEnabled),
    nextTimelineFrameId,
    nextLayerNumber: Math.max(project.data.nextLayerNumber ?? 0, getNextLayerNumber(layers)),
  };
};

const loadBitmapFromPreviewUrl = (previewUrl: string | null): Promise<ImageData | null> =>
  new Promise((resolve) => {
    if (!previewUrl) {
      resolve(null);
      return;
    }

    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth || image.width;
      canvas.height = image.naturalHeight || image.height;
      if (getExpectedBitmapDataLength(canvas.width, canvas.height) === null) {
        resolve(null);
        return;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }

      ctx.drawImage(image, 0, 0);
      resolve(getUsableBitmap(ctx.getImageData(0, 0, canvas.width, canvas.height)));
    };
    image.onerror = () => resolve(null);
    image.src = previewUrl;
  });

const hydrateStoredTimelineFrame = async (frame: StoredDrawingTimelineFrame): Promise<WorkspaceTimelineFrame> => {
  const deserializedFrame = deserializeTimelineFrame(frame);
  const shouldHydratePreview = deserializedFrame.cellType !== "blank-keyframe";
  const hydratedBitmap =
    deserializedFrame.bitmap ?? (shouldHydratePreview ? (await loadBitmapFromPreviewUrl(frame.previewUrl ?? null)) : null);
  const hydratedTweenEndBitmap =
    deserializedFrame.tweenEndBitmap ??
    (shouldHydratePreview ? (await loadBitmapFromPreviewUrl(frame.tweenEndPreviewUrl ?? null)) : null);

  return {
    ...deserializedFrame,
    bitmap: hydratedBitmap,
    tweenEndBitmap: hydratedTweenEndBitmap,
  };
};

const hydrateStoredProjectLayers = async (project: StoredDrawingProject) =>
  normalizeLayerOrder(
    await Promise.all(
      (project.data.layers ?? []).map(async (layer) => ({
        id: layer.id,
        name: layer.name,
        orderIndex: layer.orderIndex,
        timelineFrames: await Promise.all((layer.timelineFrames ?? []).map(hydrateStoredTimelineFrame)),
      })),
    ),
  );

const normalizeLayerOrder = (layers: WorkspaceLayer[]) => layers.map((layer, index) => ({ ...layer, orderIndex: index }));

const getLayerById = (layers: WorkspaceLayer[], layerId: string) => layers.find((layer) => layer.id === layerId) ?? null;

const findTimelineFrameIndexById = (frames: WorkspaceTimelineFrame[], frameId: number) =>
  frames.findIndex((frame) => frame.id === frameId);

const materializeBitmapPatch = ({
  currentBitmap,
  patchBitmap,
  patchRect,
  bitmapWidth,
  bitmapHeight,
}: {
  currentBitmap: ImageData | null;
  patchBitmap: ImageData;
  patchRect: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  bitmapWidth: number;
  bitmapHeight: number;
}) => {
  const nextBitmap = materializeSnapshotBitmap(
    {
      bitmap: null,
      previewUrl: null,
      dirtyPatchBitmap: patchBitmap,
      dirtyPatchRect: patchRect,
      bitmapWidth,
      bitmapHeight,
    },
    currentBitmap,
  );

  return isBitmapEmpty(nextBitmap) ? null : nextBitmap;
};

const applyWorkspaceTimelineFrameMetadata = (
  currentFrame: WorkspaceTimelineFrame,
  metadata: WorkspaceTimelineFrameMetadata,
  target: "bitmap" | "tweenEndBitmap",
  bitmap: ImageData | null,
): WorkspaceTimelineFrame => ({
  ...currentFrame,
  id: metadata.id,
  kind: metadata.kind,
  cellType: metadata.cellType,
  stateId: metadata.stateId,
  isBlank: metadata.isBlank,
  hasTweenEndpoint: metadata.hasTweenEndpoint,
  previewUrl: metadata.previewUrl,
  tweenEndPreviewUrl: metadata.tweenEndPreviewUrl,
  motionTween: cloneMotionTweenData(metadata.motionTween),
  soundAttachment: metadata.soundAttachment ? { ...metadata.soundAttachment } : null,
  textObjects: cloneWorkspaceTextObjects(metadata.textObjects),
  bitmap: target === "bitmap" ? bitmap : currentFrame.bitmap,
  tweenEndBitmap: target === "tweenEndBitmap" ? bitmap : currentFrame.tweenEndBitmap,
});

const resolveWorkspaceTimelineFrameTargetBitmap = (
  frame: WorkspaceTimelineFrame,
  target: "bitmap" | "tweenEndBitmap",
) => (target === "bitmap" ? frame.bitmap : frame.tweenEndBitmap);

const createLocalDrawingHistoryEntry = ({
  context,
  currentFrame,
  nextFrame,
  snapshot,
  beforePatchBitmapOverride,
}: {
  context: LocalDrawingHistoryContext;
  currentFrame: WorkspaceTimelineFrame;
  nextFrame: WorkspaceTimelineFrame;
  snapshot: TimelineFrameSnapshot | null;
  beforePatchBitmapOverride?: ImageData | null;
}): LocalDrawingHistoryEntry => {
  const beforeFrameMeta = cloneWorkspaceTimelineFrameMetadata(currentFrame);
  const afterFrameMeta = cloneWorkspaceTimelineFrameMetadata(nextFrame);
  const currentBitmap = resolveWorkspaceTimelineFrameTargetBitmap(currentFrame, context.target);
  const nextBitmap = resolveWorkspaceTimelineFrameTargetBitmap(nextFrame, context.target);

  if (hasSnapshotDirtyPatch(snapshot)) {
    return {
      kind: "patch",
      contextKey: context.key,
      layerId: context.layerId,
      viewFrameId: context.viewFrameId,
      targetFrameId: context.targetFrameId,
      target: context.target,
      bitmapWidth: snapshot.bitmapWidth,
      bitmapHeight: snapshot.bitmapHeight,
      patchRect: { ...snapshot.dirtyPatchRect },
      beforePatchBitmap: beforePatchBitmapOverride ?? captureBitmapPatch(currentBitmap, snapshot.dirtyPatchRect),
      afterPatchBitmap: snapshot.dirtyPatchBitmap,
      beforeFrameMeta,
      afterFrameMeta,
    };
  }
  return {
    kind: "snapshot",
    contextKey: context.key,
    layerId: context.layerId,
    viewFrameId: context.viewFrameId,
    targetFrameId: context.targetFrameId,
    target: context.target,
    beforeBitmap: currentBitmap,
    afterBitmap: nextBitmap,
    beforeFrameMeta,
    afterFrameMeta,
  };
};

const getGlobalTimelineFrameCount = (layers: WorkspaceLayer[]) =>
  Math.max(1, ...layers.map((layer) => Math.max(1, layer.timelineFrames.length)));

const getAuthoredPlaybackFrameCountForLayers = (layers: WorkspaceLayer[]) =>
  getAuthoredPlaybackFrameCount(layers.map((layer) => layer.timelineFrames));

const createSpanContinuationFrame = (
  id: number,
  stateId: number,
  spanType: "frame" | "tween",
): WorkspaceTimelineFrame =>
  createTimelineFrame(id, spanType === "tween" ? "tween" : "frame", spanType === "tween" ? "tween" : "hold", stateId);

const findStateStartIndex = (frames: WorkspaceTimelineFrame[], stateId: number) => {
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

const resolveStateStartIndex = (frames: WorkspaceTimelineFrame[], frameIndex: number) => {
  const frame = frames[frameIndex];
  if (!frame) return -1;

  return findStateStartIndex(frames, frame.stateId);
};

const canPersistFrameSnapshot = (frames: WorkspaceTimelineFrame[], frameIndex: number) => {
  const frame = frames[frameIndex];
  if (!frame || frame.cellType === "empty") {
    return false;
  }

  return frame.cellType !== "tween" || resolveStateStartIndex(frames, frameIndex) === frameIndex;
};

const getStateSpanEndIndex = (frames: WorkspaceTimelineFrame[], frameIndex: number) => {
  const frame = frames[frameIndex];
  if (!frame) return frameIndex;

  let endIndex = frameIndex;
  while (endIndex + 1 < frames.length && frames[endIndex + 1].stateId === frame.stateId) {
    endIndex += 1;
  }

  return endIndex;
};

const getFrameDurationEndIndex = (frames: WorkspaceTimelineFrame[], frameIndex: number) => {
  const frame = frames[frameIndex];
  if (!frame) return frameIndex;

  let endIndex = frameIndex;
  if (frame.cellType === "tween") {
    while (endIndex + 1 < frames.length && frames[endIndex + 1].cellType === "tween" && frames[endIndex + 1].stateId === frame.stateId) {
      endIndex += 1;
    }

    return endIndex;
  }

  while (endIndex + 1 < frames.length && frames[endIndex + 1].cellType === "hold" && frames[endIndex + 1].stateId === frame.stateId) {
    endIndex += 1;
  }

  return endIndex;
};

const getTweenSegmentBounds = (frames: WorkspaceTimelineFrame[], frameIndex: number) => {
  const frame = frames[frameIndex];
  if (!frame || frame.cellType !== "tween") {
    return { startIndex: frameIndex, endIndex: frameIndex };
  }

  let startIndex = frameIndex;
  while (startIndex > 0 && frames[startIndex - 1].cellType === "tween" && frames[startIndex - 1].stateId === frame.stateId) {
    startIndex -= 1;
  }

  let endIndex = frameIndex;
  while (endIndex + 1 < frames.length && frames[endIndex + 1].cellType === "tween" && frames[endIndex + 1].stateId === frame.stateId) {
    endIndex += 1;
  }

  return { startIndex, endIndex };
};

const resolveTweenSpan = (frames: WorkspaceTimelineFrame[], frameIndex: number): TweenSpanResolution | null => {
  const frame = frames[frameIndex];
  if (!frame || frame.cellType === "empty") {
    return null;
  }

  let tweenFrameIndex = frameIndex;
  if (frame.cellType !== "tween") {
    const nextFrame = frames[frameIndex + 1];
    if (nextFrame?.cellType === "tween" && nextFrame.stateId === frame.stateId) {
      tweenFrameIndex = frameIndex + 1;
    } else {
      return null;
    }
  }

  const ownerIndex = resolveStateStartIndex(frames, tweenFrameIndex);
  if (ownerIndex < 0) {
    return null;
  }

  const ownerFrame = frames[ownerIndex];
  if (!ownerFrame) {
    return null;
  }

  const { startIndex: spanStartIndex, endIndex: spanEndIndex } = getTweenSegmentBounds(frames, tweenFrameIndex);
  const hasSavedEndBitmap = Boolean(ownerFrame.tweenEndBitmap);
  const hasPlaybackValidEndpoint = Boolean(
    ownerFrame.hasTweenEndpoint && hasSavedEndBitmap && hasCompleteMotionTweenData(ownerFrame.motionTween),
  );

  return {
    ownerIndex,
    ownerFrame,
    tweenFrameIndex,
    spanStartIndex,
    spanEndIndex,
    hasSavedEndBitmap,
    hasPlaybackValidEndpoint,
  };
};

const resolveTweenEditContext = (
  frames: WorkspaceTimelineFrame[],
  frameIndex: number,
  layerId: string,
): TweenEditContext | null => {
  const frame = frames[frameIndex];
  if (!frame || frame.cellType === "empty") {
    return null;
  }

  const tweenSpan = resolveTweenSpan(frames, frameIndex);
  if (!tweenSpan) {
    return null;
  }

  if (frame.cellType === "tween") {
    return {
      layerId,
      stateId: tweenSpan.ownerFrame.stateId,
      side: "end",
      ownerIndex: tweenSpan.ownerIndex,
      spanStartIndex: tweenSpan.spanStartIndex,
      spanEndIndex: tweenSpan.spanEndIndex,
    };
  }

  if (frameIndex !== tweenSpan.ownerIndex || !isFrameStateStart(frame)) {
    return null;
  }

  return {
    layerId,
    stateId: tweenSpan.ownerFrame.stateId,
    side: "start",
    ownerIndex: tweenSpan.ownerIndex,
    spanStartIndex: tweenSpan.spanStartIndex,
    spanEndIndex: tweenSpan.spanEndIndex,
  };
};

const resolveTweenEditSide = (
  frames: WorkspaceTimelineFrame[],
  frameIndex: number,
  tweenEditContext?: TweenEditContext | null,
): "start" | "end" | null => {
  const tweenSpan = resolveTweenSpan(frames, frameIndex);
  if (!tweenSpan) {
    return null;
  }

  if (
    tweenEditContext &&
    tweenEditContext.stateId === tweenSpan.ownerFrame.stateId &&
    tweenEditContext.ownerIndex === tweenSpan.ownerIndex &&
    tweenEditContext.spanStartIndex === tweenSpan.spanStartIndex &&
    tweenEditContext.spanEndIndex === tweenSpan.spanEndIndex
  ) {
    return tweenEditContext.side;
  }

  return null;
};

const cleanupTweenEndpointForState = (frames: WorkspaceTimelineFrame[], stateId: number) => {
  const ownerIndex = findStateStartIndex(frames, stateId);
  if (ownerIndex < 0) {
    return;
  }

  const hasTweenCells = frames.some((frame) => frame.stateId === stateId && frame.cellType === "tween");
  if (hasTweenCells) {
    return;
  }

  const ownerFrame = frames[ownerIndex];
  frames[ownerIndex] = {
    ...ownerFrame,
    hasTweenEndpoint: false,
    tweenEndBitmap: null,
    tweenEndPreviewUrl: null,
    motionTween: null,
  };
};

function resolveLayerLocalCopySourceSnapshot(
  frames: WorkspaceTimelineFrame[],
  frameIndex: number,
  layerId: string,
): TimelineFrameSnapshot | null {
  const frame = frames[frameIndex] ?? null;
  if (!frame || isEmptyTimelineSlot(frame)) {
    return null;
  }

  const snapshot = adoptSnapshot(resolveTimelineSnapshot(frames, frameIndex, {
    tweenEditContext: resolveTweenEditContext(frames, frameIndex, layerId),
  }));

  return snapshot.bitmap ? snapshot : null;
}

const resolveLayerLocalCopySourceFrame = (
  frames: WorkspaceTimelineFrame[],
  frameIndex: number,
): WorkspaceTimelineFrame | null => {
  const frame = frames[frameIndex] ?? null;
  if (!frame || isEmptyTimelineSlot(frame)) {
    return null;
  }

  const tweenSpan = resolveTweenSpan(frames, frameIndex);
  if (tweenSpan) {
    return tweenSpan.ownerFrame;
  }

  const stateStartIndex = resolveStateStartIndex(frames, frameIndex);
  return stateStartIndex >= 0 ? (frames[stateStartIndex] ?? frame) : frame;
};

const resolveLayerLocalCopySourceTextObjects = (
  frames: WorkspaceTimelineFrame[],
  frameIndex: number,
) => {
  const sourceFrame = resolveLayerLocalCopySourceFrame(frames, frameIndex);
  return sourceFrame ? cloneWorkspaceTextObjects(sourceFrame.textObjects) : EMPTY_DRAWING_TEXT_OBJECTS;
};

const resolveCopiedTimelineFrame = (
  frames: WorkspaceTimelineFrame[],
  frameIndex: number,
  layerId: string,
): CopiedTimelineFrame | null => {
  const frame = frames[frameIndex] ?? null;
  if (!frame || frame.cellType === "empty") {
    return null;
  }

  const sourceFrame = resolveLayerLocalCopySourceFrame(frames, frameIndex);
  if (!sourceFrame) {
    return null;
  }

  const snapshot = adoptSnapshot(
    resolveTimelineSnapshot(frames, frameIndex, {
      tweenEditContext: resolveTweenEditContext(frames, frameIndex, layerId),
    }),
  );
  const cellType: "keyframe" | "blank-keyframe" =
    snapshot.bitmap || sourceFrame.textObjects.length > 0 ? "keyframe" : "blank-keyframe";

  return {
    sourceLayerId: layerId,
    cellType,
    snapshot:
      cellType === "blank-keyframe"
        ? { bitmap: null, previewUrl: null }
        : {
            bitmap: cloneBitmap(snapshot.bitmap),
            previewUrl: snapshot.previewUrl ?? null,
          },
    soundAttachment: sourceFrame.soundAttachment ? { ...sourceFrame.soundAttachment } : null,
    textObjects: cloneWorkspaceTextObjects(sourceFrame.textObjects),
  };
};

const findPreviousFilledIndex = (
  frames: WorkspaceTimelineFrame[],
  frameIndex: number,
  options?: { layerId?: string; requireCopyableBitmap?: boolean },
) => {
  for (let index = Math.min(frameIndex, frames.length - 1); index >= 0; index -= 1) {
    const frame = frames[index];
    if (isEmptyTimelineSlot(frame)) {
      continue;
    }

    if (options?.requireCopyableBitmap) {
      if (!options.layerId || !resolveLayerLocalCopySourceSnapshot(frames, index, options.layerId)) {
        continue;
      }
    }

    return index;
  }

  return -1;
};

const findNextFilledIndex = (frames: WorkspaceTimelineFrame[], frameIndex: number) => {
  for (let index = Math.max(0, frameIndex); index < frames.length; index += 1) {
    if (!isEmptyTimelineSlot(frames[index])) {
      return index;
    }
  }

  return -1;
};

const createBlankBitmap = (width: number, height: number) => {
  const expectedLength = getExpectedBitmapDataLength(width, height);
  if (expectedLength === null) {
    return null;
  }

  return createImageDataSafely(new Uint8ClampedArray(expectedLength), width, height);
};

const createBlankBitmapLike = (bitmap: ImageData | null) => (bitmap ? createBlankBitmap(bitmap.width, bitmap.height) : null);

type BitmapBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type BitmapOpaqueBoundsCacheEntry = {
  bounds: BitmapBounds | null;
  columnOpaqueCounts: Int32Array;
  rowOpaqueCounts: Int32Array;
};

const OPAQUE_PIXEL_ALPHA_THRESHOLD = 8;
const bitmapOpaqueBoundsCache = new WeakMap<ImageData, BitmapOpaqueBoundsCacheEntry>();

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

const motionTweenError = (scope: string, payload: Record<string, unknown>) => {
  if (!ENABLE_MOTION_TWEEN_DEBUG) {
    return;
  }

  console.error(`[motion-tween-debug] ${scope}`, payload);
};

const aiPlaybackDebug = (scope: string, payload: Record<string, unknown>) => {
  if (!ENABLE_AI_PLAYBACK_DEBUG) {
    return;
  }

  console.debug(`[ai-playback-debug] ${scope}`, payload);
};

const cloneBitmapBounds = (bounds: BitmapBounds | null): BitmapBounds | null =>
  bounds
    ? {
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
      }
    : null;

const finalizeOpaqueBoundsFromCounts = (
  columnOpaqueCounts: Int32Array,
  rowOpaqueCounts: Int32Array,
): BitmapBounds | null => {
  let left = -1;
  let right = -1;
  for (let index = 0; index < columnOpaqueCounts.length; index += 1) {
    if (columnOpaqueCounts[index] > 0) {
      left = index;
      break;
    }
  }
  for (let index = columnOpaqueCounts.length - 1; index >= 0; index -= 1) {
    if (columnOpaqueCounts[index] > 0) {
      right = index;
      break;
    }
  }

  let top = -1;
  let bottom = -1;
  for (let index = 0; index < rowOpaqueCounts.length; index += 1) {
    if (rowOpaqueCounts[index] > 0) {
      top = index;
      break;
    }
  }
  for (let index = rowOpaqueCounts.length - 1; index >= 0; index -= 1) {
    if (rowOpaqueCounts[index] > 0) {
      bottom = index;
      break;
    }
  }

  if (left < 0 || right < left || top < 0 || bottom < top) {
    return null;
  }

  return {
    left,
    top,
    width: right - left + 1,
    height: bottom - top + 1,
  };
};

const buildOpaqueBoundsCacheEntry = (bitmap: ImageData): BitmapOpaqueBoundsCacheEntry => {
  const usableBitmap = getUsableBitmap(bitmap);
  if (!usableBitmap) {
    return {
      bounds: null,
      columnOpaqueCounts: new Int32Array(0),
      rowOpaqueCounts: new Int32Array(0),
    };
  }

  const columnOpaqueCounts = new Int32Array(usableBitmap.width);
  const rowOpaqueCounts = new Int32Array(usableBitmap.height);

  for (let y = 0; y < usableBitmap.height; y += 1) {
    for (let x = 0; x < usableBitmap.width; x += 1) {
      if (usableBitmap.data[(y * usableBitmap.width + x) * 4 + 3] <= OPAQUE_PIXEL_ALPHA_THRESHOLD) {
        continue;
      }

      columnOpaqueCounts[x] += 1;
      rowOpaqueCounts[y] += 1;
    }
  }

  return {
    bounds: finalizeOpaqueBoundsFromCounts(columnOpaqueCounts, rowOpaqueCounts),
    columnOpaqueCounts,
    rowOpaqueCounts,
  };
};

const getOpaqueBoundsCacheEntry = (bitmap: ImageData | null): BitmapOpaqueBoundsCacheEntry | null => {
  const usableBitmap = getUsableBitmap(bitmap);
  if (!usableBitmap) {
    return null;
  }

  const cachedEntry = bitmapOpaqueBoundsCache.get(usableBitmap);
  if (cachedEntry) {
    return cachedEntry;
  }

  const nextEntry = buildOpaqueBoundsCacheEntry(usableBitmap);
  bitmapOpaqueBoundsCache.set(usableBitmap, nextEntry);
  return nextEntry;
};

const primeOpaqueBoundsCacheFromDirtyPatch = (
  nextBitmap: ImageData | null,
  currentBitmap: ImageData | null,
  snapshot?: TimelineFrameSnapshot | DrawingCanvasSnapshot | WorkspaceTimelineFrame | null,
) => {
  if (!nextBitmap || !hasSnapshotDirtyPatch(snapshot)) {
    return;
  }

  const expectedBitmapLength = getExpectedBitmapDataLength(snapshot.bitmapWidth, snapshot.bitmapHeight);
  const usableDirtyPatchBitmap = getUsableBitmap(snapshot.dirtyPatchBitmap);
  if (expectedBitmapLength === null || !usableDirtyPatchBitmap) {
    return;
  }

  const canReuseCurrentEntryInPlace =
    Boolean(
      currentBitmap &&
      nextBitmap === currentBitmap &&
      currentBitmap.width === snapshot.bitmapWidth &&
      currentBitmap.height === snapshot.bitmapHeight,
    );
  const currentEntry =
    currentBitmap &&
    currentBitmap.width === snapshot.bitmapWidth &&
    currentBitmap.height === snapshot.bitmapHeight
      ? getOpaqueBoundsCacheEntry(currentBitmap)
      : null;

  if (currentBitmap && !currentEntry) {
    return;
  }

  const columnOpaqueCounts = canReuseCurrentEntryInPlace && currentEntry
    ? currentEntry.columnOpaqueCounts
    : new Int32Array(snapshot.bitmapWidth);
  const rowOpaqueCounts = canReuseCurrentEntryInPlace && currentEntry
    ? currentEntry.rowOpaqueCounts
    : new Int32Array(snapshot.bitmapHeight);

  if (currentEntry && !canReuseCurrentEntryInPlace) {
    columnOpaqueCounts.set(currentEntry.columnOpaqueCounts);
    rowOpaqueCounts.set(currentEntry.rowOpaqueCounts);
  }

  const { dirtyPatchRect } = snapshot;
  for (let row = 0; row < dirtyPatchRect.height; row += 1) {
    for (let column = 0; column < dirtyPatchRect.width; column += 1) {
      const x = dirtyPatchRect.left + column;
      const y = dirtyPatchRect.top + row;
      const oldAlpha =
        currentBitmap &&
        currentBitmap.width === snapshot.bitmapWidth &&
        currentBitmap.height === snapshot.bitmapHeight
          ? currentBitmap.data[(y * currentBitmap.width + x) * 4 + 3]
          : 0;
      const newAlpha = usableDirtyPatchBitmap.data[(row * dirtyPatchRect.width + column) * 4 + 3];
      const oldOpaque = oldAlpha > OPAQUE_PIXEL_ALPHA_THRESHOLD;
      const newOpaque = newAlpha > OPAQUE_PIXEL_ALPHA_THRESHOLD;

      if (oldOpaque === newOpaque) {
        continue;
      }

      const nextColumnCount = columnOpaqueCounts[x] + (newOpaque ? 1 : -1);
      const nextRowCount = rowOpaqueCounts[y] + (newOpaque ? 1 : -1);
      columnOpaqueCounts[x] = Math.max(0, nextColumnCount);
      rowOpaqueCounts[y] = Math.max(0, nextRowCount);
    }
  }

  bitmapOpaqueBoundsCache.set(nextBitmap, {
    bounds: finalizeOpaqueBoundsFromCounts(columnOpaqueCounts, rowOpaqueCounts),
    columnOpaqueCounts,
    rowOpaqueCounts,
  });
};

const findOpaqueBitmapBounds = (bitmap: ImageData | null): BitmapBounds | null =>
  cloneBitmapBounds(getOpaqueBoundsCacheEntry(bitmap)?.bounds ?? null);

const mergeBitmapBounds = (currentBounds: BitmapBounds | null, nextBounds: BitmapBounds | null): BitmapBounds | null => {
  if (!currentBounds) {
    return nextBounds;
  }

  if (!nextBounds) {
    return currentBounds;
  }

  const left = Math.min(currentBounds.left, nextBounds.left);
  const top = Math.min(currentBounds.top, nextBounds.top);
  const right = Math.max(currentBounds.left + currentBounds.width, nextBounds.left + nextBounds.width);
  const bottom = Math.max(currentBounds.top + currentBounds.height, nextBounds.top + nextBounds.height);

  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
};

const padBitmapBounds = (
  bounds: BitmapBounds,
  stageWidth: number,
  stageHeight: number,
  padding: number,
): BitmapBounds => {
  const left = Math.max(0, bounds.left - padding);
  const top = Math.max(0, bounds.top - padding);
  const right = Math.min(stageWidth, bounds.left + bounds.width + padding);
  const bottom = Math.min(stageHeight, bounds.top + bounds.height + padding);

  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
};

const createBitmapCanvas = (bitmap: ImageData) => {
  const usableBitmap = getUsableBitmap(bitmap);
  if (!usableBitmap) {
    return null;
  }

  const cachedCanvas = bitmapCanvasCache.get(usableBitmap);
  if (cachedCanvas) {
    return cachedCanvas;
  }

  const canvas = document.createElement("canvas");
  canvas.width = usableBitmap.width;
  canvas.height = usableBitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  try {
    ctx.putImageData(usableBitmap, 0, 0);
  } catch {
    return null;
  }
  bitmapCanvasCache.set(usableBitmap, canvas);
  return canvas;
};

const drawBitmapCanvasCentered = (
  ctx: CanvasRenderingContext2D,
  sourceCanvas: HTMLCanvasElement,
  targetWidth: number,
  targetHeight: number,
) => {
  const drawLeft = Math.round((targetWidth - sourceCanvas.width) / 2);
  const drawTop = Math.round((targetHeight - sourceCanvas.height) / 2);
  ctx.drawImage(sourceCanvas, drawLeft, drawTop, sourceCanvas.width, sourceCanvas.height);
};

const exportCanvasToDataUrl = (
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number,
) => {
  try {
    return canvas.toDataURL(mimeType, quality);
  } catch {
    return null;
  }
};

const exportProjectPreviewDataUrl = (canvas: HTMLCanvasElement) => {
  let smallestDataUrl: string | null = null;

  for (const [mimeType, qualities] of [
    ["image/webp", [0.54, 0.42, 0.3]],
    ["image/jpeg", [0.5, 0.38, 0.26]],
  ] as const) {
    for (const quality of qualities) {
      const nextDataUrl = exportCanvasToDataUrl(canvas, mimeType, quality);
      if (!nextDataUrl) {
        continue;
      }

      if (!smallestDataUrl || nextDataUrl.length < smallestDataUrl.length) {
        smallestDataUrl = nextDataUrl;
      }

      if (nextDataUrl.length <= PROJECT_PREVIEW_MAX_LENGTH) {
        return nextDataUrl;
      }
    }
  }

  return smallestDataUrl;
};

const downscaleCanvasForPreview = (
  sourceCanvas: HTMLCanvasElement,
  targetWidth: number,
  targetHeight: number,
) => {
  let workingCanvas = sourceCanvas;

  while (workingCanvas.width > targetWidth * 2 && workingCanvas.height > targetHeight * 2) {
    const nextCanvas = document.createElement("canvas");
    nextCanvas.width = Math.max(targetWidth, Math.round(workingCanvas.width / 2));
    nextCanvas.height = Math.max(targetHeight, Math.round(workingCanvas.height / 2));
    const nextCtx = nextCanvas.getContext("2d");
    if (!nextCtx) {
      return workingCanvas;
    }

    nextCtx.imageSmoothingEnabled = true;
    nextCtx.imageSmoothingQuality = "high";
    nextCtx.drawImage(workingCanvas, 0, 0, nextCanvas.width, nextCanvas.height);
    workingCanvas = nextCanvas;
  }

  return workingCanvas;
};

const createCompactBitmapDataUrl = (
  bitmap: ImageData | null,
  options?: {
    maxLength?: number;
    mimeType?: string;
    qualities?: number[];
    flattenBackground?: string | null;
    maxDimension?: number;
  },
) => {
  if (!bitmap) {
    return null;
  }

  const sourceCanvas = createBitmapCanvas(bitmap);
  if (!sourceCanvas) {
    return null;
  }

  const sourceMaxDimension = Math.max(sourceCanvas.width, sourceCanvas.height);
  const maxDimension = options?.maxDimension ?? sourceMaxDimension;
  const targetMaxLength = options?.maxLength ?? Number.POSITIVE_INFINITY;
  const qualities = options?.qualities ?? [0.55, 0.35, 0.2];
  let smallestDataUrl: string | null = null;
  const baseScale = maxDimension > 0 ? Math.min(1, maxDimension / sourceMaxDimension) : 1;
  const scaleCandidates = [...new Set(
    [1, 0.88, 0.76, 0.64, 0.54]
      .map((factor) => Math.max(0.4, Math.min(1, baseScale * factor)))
      .map((scale) => Number(scale.toFixed(4))),
  )];

  for (const scale of scaleCandidates) {
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = Math.max(1, Math.round(sourceCanvas.width * scale));
    exportCanvas.height = Math.max(1, Math.round(sourceCanvas.height * scale));
    const exportCtx = exportCanvas.getContext("2d");
    if (!exportCtx) {
      continue;
    }

    if (options?.flattenBackground) {
      exportCtx.fillStyle = options.flattenBackground;
      exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    }

    exportCtx.drawImage(sourceCanvas, 0, 0, exportCanvas.width, exportCanvas.height);

    for (const quality of qualities) {
      const nextDataUrl = exportCanvasToDataUrl(exportCanvas, options?.mimeType ?? "image/webp", quality);
      if (!nextDataUrl) {
        continue;
      }

      if (!smallestDataUrl || nextDataUrl.length < smallestDataUrl.length) {
        smallestDataUrl = nextDataUrl;
      }

      if (nextDataUrl.length <= targetMaxLength) {
        return nextDataUrl;
      }
    }
  }

  return smallestDataUrl ?? exportCanvasToDataUrl(sourceCanvas, "image/png");
};

const createStoredBitmapPreviewUrl = (bitmap: ImageData | null) => {
  if (!bitmap) {
    return null;
  }

  if (bitmapStoredPreviewUrlCache.has(bitmap)) {
    return bitmapStoredPreviewUrlCache.get(bitmap) ?? null;
  }

  const previewUrl =
    createCompactBitmapDataUrl(bitmap, {
      maxLength: STORED_FRAME_IMAGE_MAX_LENGTH,
      mimeType: "image/webp",
      qualities: [0.42, 0.28, 0.16],
      maxDimension: STORED_FRAME_IMAGE_MAX_DIMENSION,
    }) ?? null;
  bitmapStoredPreviewUrlCache.set(bitmap, previewUrl);
  return previewUrl;
};

const createLiveBitmapPreviewUrl = (bitmap: ImageData | null) => {
  if (!bitmap) {
    return null;
  }

  if (bitmapLivePreviewUrlCache.has(bitmap)) {
    return bitmapLivePreviewUrlCache.get(bitmap) ?? null;
  }

  const previewUrl =
    createCompactBitmapDataUrl(bitmap, {
      maxLength: LIVE_FRAME_PREVIEW_MAX_LENGTH,
      mimeType: "image/webp",
      qualities: [0.44, 0.3, 0.18],
      maxDimension: LIVE_FRAME_PREVIEW_MAX_DIMENSION,
    }) ?? null;
  bitmapLivePreviewUrlCache.set(bitmap, previewUrl);
  return previewUrl;
};

const cropBitmapToBounds = (bitmap: ImageData, bounds: BitmapBounds) => {
  const sourceCanvas = createBitmapCanvas(bitmap);
  if (!sourceCanvas) return null;

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = bounds.width;
  outputCanvas.height = bounds.height;
  const outputCtx = outputCanvas.getContext("2d");
  if (!outputCtx) return null;

  outputCtx.clearRect(0, 0, bounds.width, bounds.height);
  outputCtx.drawImage(
    sourceCanvas,
    bounds.left,
    bounds.top,
    bounds.width,
    bounds.height,
    0,
    0,
    bounds.width,
    bounds.height,
  );

  return outputCtx.getImageData(0, 0, bounds.width, bounds.height);
};

const lerp = (start: number, end: number, progress: number) => start + (end - start) * progress;

type DerivedMotionTweenOriginPayload = {
  origin: MotionTweenOrigin;
  stageWidth: number;
  stageHeight: number;
  bounds: BitmapBounds;
};

type DerivedMotionTweenSpritePayload = DerivedMotionTweenOriginPayload & {
  spriteBitmap: ImageData;
};

const deriveMotionTweenOriginFromBitmap = (bitmap: ImageData | null): DerivedMotionTweenOriginPayload | null => {
  if (!bitmap) {
    return null;
  }

  const bounds = findSavePathBitmapBounds(bitmap);
  if (!bounds) {
    return null;
  }

  return {
    origin: {
      x: bounds.left,
      y: bounds.top,
    },
    stageWidth: bitmap.width,
    stageHeight: bitmap.height,
    bounds,
  };
};

const deriveMotionTweenSpriteAndOrigin = (bitmap: ImageData | null): DerivedMotionTweenSpritePayload | null => {
  const originPayload = deriveMotionTweenOriginFromBitmap(bitmap);
  if (!bitmap || !originPayload) {
    return null;
  }

  const spriteBitmap = cropBitmapToBounds(bitmap, originPayload.bounds);
  if (!spriteBitmap) {
    return null;
  }

  return {
    ...originPayload,
    spriteBitmap,
  };
};

const createPositionMotionTweenData = (
  spriteBitmap: ImageData,
  startOrigin: MotionTweenOrigin,
  options: {
    endOrigin?: MotionTweenOrigin | null;
    startStageWidth: number;
    startStageHeight: number;
    endStageWidth?: number;
    endStageHeight?: number;
    previousMotionTween?: MotionTweenData | null;
  },
): MotionTweenData => ({
  mode: "position",
  stageWidth: Math.max(
    options.startStageWidth,
    options.endStageWidth ?? 0,
    options.previousMotionTween?.stageWidth ?? 0,
  ),
  stageHeight: Math.max(
    options.startStageHeight,
    options.endStageHeight ?? 0,
    options.previousMotionTween?.stageHeight ?? 0,
  ),
  spriteBitmap,
  startOrigin,
  endOrigin: cloneMotionTweenOrigin(options.endOrigin ?? null),
});

const buildMotionTweenFromStartSnapshot = (
  startBitmap: ImageData | null,
  previousMotionTween: MotionTweenData | null,
): MotionTweenBuildResult => {
  const startPayload = deriveMotionTweenSpriteAndOrigin(startBitmap);
  const debugMeta = {
    derivedStartPayload: startPayload
      ? {
          origin: startPayload.origin,
          stageWidth: startPayload.stageWidth,
          stageHeight: startPayload.stageHeight,
          bounds: startPayload.bounds,
          spriteBitmap: summarizeBitmapForMotionTweenDebug(startPayload.spriteBitmap),
        }
      : null,
    previousMotionTween: summarizeMotionTweenForDebug(previousMotionTween),
  };

  if (!startBitmap) {
    motionTweenDebug("buildMotionTweenFromStartSnapshot", {
      result: "clear",
      reason: "empty_start_snapshot",
      ...debugMeta,
    });
    return {
      status: "clear",
      reason: "empty_start_snapshot",
      motionTween: null,
      debugMeta,
    };
  }

  if (!startPayload) {
    motionTweenWarn("buildMotionTweenFromStartSnapshot", {
      result: "invalid",
      reason: "start_payload_derivation_failed",
      ...debugMeta,
    });
    return {
      status: "invalid",
      reason: "start_payload_derivation_failed",
      debugMeta,
    };
  }

  const motionTween = createPositionMotionTweenData(startPayload.spriteBitmap, startPayload.origin, {
    endOrigin: previousMotionTween?.endOrigin ?? null,
    startStageWidth: startPayload.stageWidth,
    startStageHeight: startPayload.stageHeight,
    previousMotionTween,
  });

  motionTweenDebug("buildMotionTweenFromStartSnapshot", {
    result: "success",
    reason: "start_payload_ready",
    ...debugMeta,
    motionTween: summarizeMotionTweenForDebug(motionTween),
  });

  return {
    status: "success",
    reason: "start_payload_ready",
    motionTween,
    debugMeta,
  };
};

const buildMotionTweenFromEndpointSnapshots = (
  startBitmap: ImageData | null,
  endBitmap: ImageData | null,
  previousMotionTween: MotionTweenData | null,
): MotionTweenBuildResult => {
  const derivedStartPayload = deriveMotionTweenSpriteAndOrigin(startBitmap);
  const spriteBitmap = derivedStartPayload?.spriteBitmap ?? cloneBitmap(previousMotionTween?.spriteBitmap ?? null);
  const startOrigin = derivedStartPayload?.origin ?? cloneMotionTweenOrigin(previousMotionTween?.startOrigin ?? null);
  const endPayload = deriveMotionTweenOriginFromBitmap(endBitmap);
  const debugMeta = {
    hasStartBitmap: Boolean(startBitmap),
    hasEndBitmap: Boolean(endBitmap),
    hasDerivedStartPayload: Boolean(derivedStartPayload),
    hasDerivedEndPayload: Boolean(endPayload),
    derivedStartPayload: derivedStartPayload
      ? {
          origin: derivedStartPayload.origin,
          stageWidth: derivedStartPayload.stageWidth,
          stageHeight: derivedStartPayload.stageHeight,
          bounds: derivedStartPayload.bounds,
          spriteBitmap: summarizeBitmapForMotionTweenDebug(derivedStartPayload.spriteBitmap),
        }
      : null,
    derivedEndPayload: endPayload
      ? {
          origin: endPayload.origin,
          stageWidth: endPayload.stageWidth,
          stageHeight: endPayload.stageHeight,
          bounds: endPayload.bounds,
        }
      : null,
    previousEndOrigin: previousMotionTween?.endOrigin ?? null,
    previousMotionTween: summarizeMotionTweenForDebug(previousMotionTween),
  };

  if (!endBitmap) {
    const motionTween =
      spriteBitmap && startOrigin
        ? createPositionMotionTweenData(spriteBitmap, startOrigin, {
            endOrigin: null,
            startStageWidth: derivedStartPayload?.stageWidth ?? previousMotionTween?.stageWidth ?? 0,
            startStageHeight: derivedStartPayload?.stageHeight ?? previousMotionTween?.stageHeight ?? 0,
            previousMotionTween,
          })
        : null;

    motionTweenDebug("buildMotionTweenFromEndpointSnapshots", {
      result: "clear",
      reason: "empty_end_snapshot",
      ...debugMeta,
      motionTween: summarizeMotionTweenForDebug(motionTween),
    });
    return {
      status: "clear",
      reason: "empty_end_snapshot",
      motionTween,
      debugMeta,
    };
  }

  if (!spriteBitmap || !startOrigin) {
    motionTweenWarn("buildMotionTweenFromEndpointSnapshots", {
      result: "invalid",
      reason: "missing_start_payload",
      ...debugMeta,
    });
    return {
      status: "invalid",
      reason: "missing_start_payload",
      debugMeta,
    };
  }

  if (!endPayload) {
    motionTweenWarn("buildMotionTweenFromEndpointSnapshots", {
      result: "invalid",
      reason: "end_origin_derivation_failed",
      ...debugMeta,
    });
    return {
      status: "invalid",
      reason: "end_origin_derivation_failed",
      debugMeta,
    };
  }

  const motionTween = createPositionMotionTweenData(spriteBitmap, startOrigin, {
    endOrigin: endPayload.origin,
    startStageWidth: derivedStartPayload?.stageWidth ?? previousMotionTween?.stageWidth ?? 0,
    startStageHeight: derivedStartPayload?.stageHeight ?? previousMotionTween?.stageHeight ?? 0,
    endStageWidth: endPayload.stageWidth,
    endStageHeight: endPayload.stageHeight,
    previousMotionTween,
  });

  motionTweenDebug("buildMotionTweenFromEndpointSnapshots", {
    result: "success",
    reason: "end_payload_ready",
    ...debugMeta,
    finalEndOrigin: motionTween.endOrigin,
    motionTween: summarizeMotionTweenForDebug(motionTween),
  });

  return {
    status: "success",
    reason: "end_payload_ready",
    motionTween,
    debugMeta,
  };
};

const hasCompleteMotionTweenData = (motionTween: MotionTweenData | null): motionTween is MotionTweenData =>
  Boolean(
    motionTween &&
      motionTween.mode === "position" &&
      motionTween.stageWidth > 0 &&
      motionTween.stageHeight > 0 &&
      motionTween.spriteBitmap &&
      motionTween.startOrigin &&
      motionTween.endOrigin,
  );

const classifyMotionTweenOwnerValidity = (
  frames: WorkspaceTimelineFrame[],
  ownerIndex: number,
): MotionTweenOwnerValidity => {
  const ownerFrame = frames[ownerIndex] ?? null;
  const tweenSpan = resolveTweenSpan(frames, ownerIndex);
  const motionTween = ownerFrame?.motionTween ?? null;
  const hasSavedEndBitmap = Boolean(ownerFrame?.tweenEndBitmap);
  const hasTweenEndpointFlag = Boolean(ownerFrame?.hasTweenEndpoint);
  const hasMotionPayload = Boolean(motionTween);
  const hasSpriteBitmap = Boolean(motionTween?.spriteBitmap);
  const hasStartOrigin = Boolean(motionTween?.startOrigin);
  const hasEndOrigin = Boolean(motionTween?.endOrigin);
  const hasValidStageDimensions = Boolean(motionTween && motionTween.stageWidth > 0 && motionTween.stageHeight > 0);
  const hasCompleteMotionPayload = hasCompleteMotionTweenData(motionTween);
  const hasPlaybackValidEndpoint = Boolean(hasTweenEndpointFlag && hasSavedEndBitmap && hasCompleteMotionPayload);

  let reason: MotionTweenOwnerValidityReason | null = null;
  if (!tweenSpan) {
    reason = "missing_tween_span";
  } else if (!hasSavedEndBitmap) {
    reason = "missing_saved_end_bitmap";
  } else if (!motionTween) {
    reason = "missing_motion_payload";
  } else if (!motionTween.spriteBitmap) {
    reason = "missing_sprite_bitmap";
  } else if (!motionTween.startOrigin) {
    reason = "missing_start_origin";
  } else if (!motionTween.endOrigin) {
    reason = "missing_end_origin";
  } else if (!(motionTween.stageWidth > 0 && motionTween.stageHeight > 0)) {
    reason = "invalid_stage_dimensions";
  } else if (!hasTweenEndpointFlag) {
    reason = "saved_end_bitmap_not_playback_valid";
  }

  return {
    isValid: reason === null,
    reason,
    ownerFrame,
    motionTween,
    tweenSpan,
    debugMeta: {
      ownerIndex,
      stateId: ownerFrame?.stateId ?? null,
      spanStartIndex: tweenSpan?.spanStartIndex ?? null,
      spanEndIndex: tweenSpan?.spanEndIndex ?? null,
      hasTweenSpan: Boolean(tweenSpan),
      hasSavedEndBitmap,
      hasTweenEndpointFlag,
      hasPlaybackValidEndpoint,
      hasMotionPayload,
      hasCompleteMotionPayload,
      hasSpriteBitmap,
      hasStartOrigin,
      hasEndOrigin,
      hasValidStageDimensions,
      ownerBitmap: summarizeBitmapForMotionTweenDebug(ownerFrame?.bitmap ?? null),
      tweenEndBitmap: summarizeBitmapForMotionTweenDebug(ownerFrame?.tweenEndBitmap ?? null),
      motionTween: summarizeMotionTweenForDebug(motionTween),
    },
  };
};

const isRecoverablePlaybackFallbackReason = (reason: unknown) =>
  reason === "missing_tween_span" ||
  reason === "missing_saved_end_bitmap" ||
  reason === "saved_end_bitmap_not_playback_valid" ||
  reason === "missing_motion_payload" ||
  reason === "missing_sprite_bitmap" ||
  reason === "missing_start_origin" ||
  reason === "missing_end_origin" ||
  reason === "invalid_stage_dimensions";

const isPlaybackInvariantFailureReason = (reason: unknown) =>
  reason === "cache_invariant_miss" || reason === "descriptor_recovery_failed" || reason === "render_failed";

const getFrozenTweenPlaybackKey = (layerId: string, ownerIndex: number, stateId: number) =>
  `${layerId}:${ownerIndex}:${stateId}`;

const summarizeBitmapForMotionTweenDebug = (bitmap: ImageData | null) => ({
  exists: Boolean(bitmap),
  width: bitmap?.width ?? null,
  height: bitmap?.height ?? null,
  bounds: findSavePathBitmapBounds(bitmap),
});

const summarizeMotionTweenForDebug = (motionTween: MotionTweenData | null) => ({
  exists: Boolean(motionTween),
  mode: motionTween?.mode ?? null,
  stageWidth: motionTween?.stageWidth ?? null,
  stageHeight: motionTween?.stageHeight ?? null,
  spriteBitmap: summarizeBitmapForMotionTweenDebug(motionTween?.spriteBitmap ?? null),
  startOrigin: motionTween?.startOrigin ?? null,
  endOrigin: motionTween?.endOrigin ?? null,
});

const bitmapsEqual = (left: ImageData | null, right: ImageData | null) => {
  if (left === right) return true;
  if (!left && !right) return true;
  if (!left || !right) return false;
  if (left.width !== right.width || left.height !== right.height || left.data.length !== right.data.length) {
    return false;
  }

  for (let index = 0; index < left.data.length; index += 1) {
    if (left.data[index] !== right.data[index]) {
      return false;
    }
  }

  return true;
};

const EMPTY_ONION_FRAME_PREVIEW: OnionFramePreview = {
  bitmap: null,
  textObjects: EMPTY_DRAWING_TEXT_OBJECTS,
};

const onionFramePreviewsEqual = (left: OnionFramePreview | null, right: OnionFramePreview | null) => {
  if (left === right) {
    return true;
  }

  if (!left && !right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return bitmapsEqual(left.bitmap, right.bitmap) && drawingTextObjectsEqual(left.textObjects, right.textObjects);
};

const onionFramePreviewHasContent = (preview: OnionFramePreview | null | undefined) =>
  Boolean(preview && (preview.bitmap || preview.textObjects.length > 0));

const motionTweenOriginsEqual = (left: MotionTweenOrigin | null, right: MotionTweenOrigin | null) =>
  (!left && !right) || (Boolean(left) && Boolean(right) && left!.x === right!.x && left!.y === right!.y);

const motionTweensEqual = (left: MotionTweenData | null, right: MotionTweenData | null) =>
  left === right ||
  (!left && !right) ||
  (Boolean(left) &&
    Boolean(right) &&
    left!.mode === right!.mode &&
    left!.stageWidth === right!.stageWidth &&
    left!.stageHeight === right!.stageHeight &&
    bitmapsEqual(left!.spriteBitmap, right!.spriteBitmap) &&
    motionTweenOriginsEqual(left!.startOrigin, right!.startOrigin) &&
    motionTweenOriginsEqual(left!.endOrigin, right!.endOrigin));

const soundAttachmentsEqual = (left: WorkspaceSoundAttachment | null, right: WorkspaceSoundAttachment | null) =>
  left === right ||
  (!left && !right) ||
  (Boolean(left) &&
    Boolean(right) &&
    left!.id === right!.id &&
    left!.title === right!.title &&
    left!.description === right!.description &&
    left!.timingFeel === right!.timingFeel &&
    left!.intensityFeel === right!.intensityFeel &&
    left!.audioDataUrl === right!.audioDataUrl &&
    left!.contentType === right!.contentType &&
    left!.speechText === right!.speechText &&
    left!.sourceTask === right!.sourceTask &&
    left!.attachedAt === right!.attachedAt);

const workspaceTimelineFrameEqual = (
  left: WorkspaceTimelineFrame | null | undefined,
  right: WorkspaceTimelineFrame | null | undefined,
) =>
  left === right ||
  (!left && !right) ||
  (Boolean(left) &&
    Boolean(right) &&
    left!.id === right!.id &&
    left!.kind === right!.kind &&
    left!.cellType === right!.cellType &&
    left!.stateId === right!.stateId &&
    left!.isBlank === right!.isBlank &&
    left!.hasTweenEndpoint === right!.hasTweenEndpoint &&
    bitmapsEqual(left!.bitmap, right!.bitmap) &&
    bitmapsEqual(left!.tweenEndBitmap, right!.tweenEndBitmap) &&
    motionTweensEqual(left!.motionTween, right!.motionTween) &&
    soundAttachmentsEqual(left!.soundAttachment, right!.soundAttachment) &&
    drawingTextObjectsEqual(left!.textObjects, right!.textObjects));

const workspaceTimelineFramesEqual = (left: WorkspaceTimelineFrame[], right: WorkspaceTimelineFrame[]) => {
  if (left === right) {
    return true;
  }

  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    const leftFrame = left[index];
    const rightFrame = right[index];
    if (!workspaceTimelineFrameEqual(leftFrame, rightFrame)) {
      return false;
    }
  }

  return true;
};

const workspaceTimelineFramesStructureEqual = (left: WorkspaceTimelineFrame[], right: WorkspaceTimelineFrame[]) => {
  if (left === right) {
    return true;
  }

  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    const leftFrame = left[index];
    const rightFrame = right[index];
    if (
      !rightFrame ||
      leftFrame.id !== rightFrame.id ||
      leftFrame.kind !== rightFrame.kind ||
      leftFrame.cellType !== rightFrame.cellType ||
      leftFrame.stateId !== rightFrame.stateId
    ) {
      return false;
    }
  }

  return true;
};

const workspaceLayersEqual = (left: WorkspaceLayer[], right: WorkspaceLayer[]) => {
  if (left === right) {
    return true;
  }

  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    const leftLayer = left[index];
    const rightLayer = right[index];
    if (
      !rightLayer ||
      leftLayer.id !== rightLayer.id ||
      leftLayer.name !== rightLayer.name ||
      leftLayer.orderIndex !== rightLayer.orderIndex ||
      !workspaceTimelineFramesEqual(leftLayer.timelineFrames, rightLayer.timelineFrames)
    ) {
      return false;
    }
  }

  return true;
};

const workspaceLayersStructureEqual = (left: WorkspaceLayer[], right: WorkspaceLayer[]) => {
  if (left === right) {
    return true;
  }

  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    const leftLayer = left[index];
    const rightLayer = right[index];
    if (
      !rightLayer ||
      leftLayer.id !== rightLayer.id ||
      leftLayer.orderIndex !== rightLayer.orderIndex ||
      !workspaceTimelineFramesStructureEqual(leftLayer.timelineFrames, rightLayer.timelineFrames)
    ) {
      return false;
    }
  }

  return true;
};

const historyEntriesMatchDocument = (left: DrawingWorkspaceHistoryEntry, right: DrawingWorkspaceHistoryEntry) =>
  left === right ||
  (left.nextTimelineFrameId === right.nextTimelineFrameId &&
    left.nextLayerNumber === right.nextLayerNumber &&
    workspaceLayersEqual(left.layers, right.layers));

const historyEntriesEqual = (left: DrawingWorkspaceHistoryEntry, right: DrawingWorkspaceHistoryEntry) =>
  left === right || historyEntriesMatchDocument(left, right);

type HistoryEditingContextResolution = {
  layerMissing: boolean;
  frame: WorkspaceTimelineFrame | null;
  resolvedBitmap: ImageData | null;
  resolvedStateStartIndex: number;
};

const resolveHistoryEditingContext = (
  entry: DrawingWorkspaceHistoryEntry,
  layerId: string,
  frameIndex: number,
): HistoryEditingContextResolution => {
  const layer = getLayerById(entry.layers, layerId) ?? null;
  if (!layer) {
    return {
      layerMissing: true,
      frame: null,
      resolvedBitmap: null,
      resolvedStateStartIndex: -1,
    };
  }

  const tweenEditContext = resolveTweenEditContext(layer.timelineFrames, frameIndex, layerId);

  return {
    layerMissing: false,
    frame: layer.timelineFrames[frameIndex] ?? null,
    resolvedBitmap: resolveTimelineBitmap(layer.timelineFrames, frameIndex, { tweenEditContext }),
    resolvedStateStartIndex: resolveStateStartIndex(layer.timelineFrames, frameIndex),
  };
};

const historyEditingContextsEqual = (
  left: HistoryEditingContextResolution,
  right: HistoryEditingContextResolution,
) =>
  left.layerMissing === right.layerMissing &&
  left.resolvedStateStartIndex === right.resolvedStateStartIndex &&
  workspaceTimelineFrameEqual(left.frame, right.frame) &&
  bitmapsEqual(left.resolvedBitmap, right.resolvedBitmap);

const buildFrozenTweenPlaybackDescriptor = (
  layerId: string,
  frames: WorkspaceTimelineFrame[],
  ownerIndex: number,
): FrozenTweenPlaybackDescriptorResult => {
  const ownerValidity = classifyMotionTweenOwnerValidity(frames, ownerIndex);
  const ownerFrame = ownerValidity.ownerFrame;
  const baseDebugPayload = {
    layerId,
    ownerIndex,
    stateId: ownerFrame?.stateId ?? null,
  };

  if (!ownerValidity.isValid || !ownerValidity.tweenSpan || !ownerFrame) {
    motionTweenWarn("buildFrozenTweenPlaybackDescriptor:failure", {
      ...baseDebugPayload,
      reason: ownerValidity.reason ?? "missing_tween_span",
      ...ownerValidity.debugMeta,
    });
    return {
      status: "invalid",
      reason: ownerValidity.reason ?? "missing_tween_span",
      debugMeta: {
        ...baseDebugPayload,
        ...ownerValidity.debugMeta,
      },
    };
  }

  const tweenSpan = ownerValidity.tweenSpan;
  const motionTween = cloneMotionTweenData(ownerFrame.motionTween);
  if (!motionTween) {
    motionTweenWarn("buildFrozenTweenPlaybackDescriptor:failure", {
      ...baseDebugPayload,
      reason: "missing_motion_payload",
      ...ownerValidity.debugMeta,
    });
    return {
      status: "invalid",
      reason: "missing_motion_payload",
      debugMeta: {
        ...baseDebugPayload,
        ...ownerValidity.debugMeta,
      },
    };
  }
  if (!motionTween.startOrigin) {
    motionTweenWarn("buildFrozenTweenPlaybackDescriptor:failure", {
      ...baseDebugPayload,
      reason: "missing_start_origin",
      ...ownerValidity.debugMeta,
    });
    return {
      status: "invalid",
      reason: "missing_start_origin",
      debugMeta: {
        ...baseDebugPayload,
        ...ownerValidity.debugMeta,
      },
    };
  }
  if (!motionTween.endOrigin) {
    motionTweenWarn("buildFrozenTweenPlaybackDescriptor:failure", {
      ...baseDebugPayload,
      reason: "missing_end_origin",
      ...ownerValidity.debugMeta,
    });
    return {
      status: "invalid",
      reason: "missing_end_origin",
      debugMeta: {
        ...baseDebugPayload,
        ...ownerValidity.debugMeta,
      },
    };
  }

  const spriteBitmap = cloneBitmap(motionTween.spriteBitmap);
  if (!spriteBitmap) {
    motionTweenWarn("buildFrozenTweenPlaybackDescriptor:failure", {
      ...baseDebugPayload,
      reason: "missing_sprite_bitmap",
      motionTween: summarizeMotionTweenForDebug(motionTween),
      spanStartIndex: tweenSpan.spanStartIndex,
      spanEndIndex: tweenSpan.spanEndIndex,
    });
    return {
      status: "invalid",
      reason: "missing_sprite_bitmap",
      debugMeta: {
        ...baseDebugPayload,
        spanStartIndex: tweenSpan.spanStartIndex,
        spanEndIndex: tweenSpan.spanEndIndex,
      },
    };
  }

  const spriteCanvas = createBitmapCanvas(spriteBitmap);
  if (!spriteCanvas) {
    motionTweenWarn("buildFrozenTweenPlaybackDescriptor:failure", {
      ...baseDebugPayload,
      reason: "sprite_canvas_failed",
      motionTween: summarizeMotionTweenForDebug(motionTween),
      spanStartIndex: tweenSpan.spanStartIndex,
      spanEndIndex: tweenSpan.spanEndIndex,
    });
    return {
      status: "invalid",
      reason: "sprite_canvas_failed",
      debugMeta: {
        ...baseDebugPayload,
        spanStartIndex: tweenSpan.spanStartIndex,
        spanEndIndex: tweenSpan.spanEndIndex,
      },
    };
  }

  const renderCanvas = document.createElement("canvas");
  const stageWidth = Math.max(1, motionTween.stageWidth);
  const stageHeight = Math.max(1, motionTween.stageHeight);
  renderCanvas.width = stageWidth;
  renderCanvas.height = stageHeight;
  const renderCtx = renderCanvas.getContext("2d");
  if (!renderCtx) {
    motionTweenWarn("buildFrozenTweenPlaybackDescriptor:failure", {
      ...baseDebugPayload,
      reason: "render_ctx_failed",
      motionTween: summarizeMotionTweenForDebug(motionTween),
      spanStartIndex: tweenSpan.spanStartIndex,
      spanEndIndex: tweenSpan.spanEndIndex,
    });
    return {
      status: "invalid",
      reason: "render_ctx_failed",
      debugMeta: {
        ...baseDebugPayload,
        spanStartIndex: tweenSpan.spanStartIndex,
        spanEndIndex: tweenSpan.spanEndIndex,
      },
    };
  }

  const descriptor = {
    layerId,
    ownerIndex,
    stateId: ownerFrame.stateId,
    stageWidth,
    stageHeight,
    spriteCanvas,
    spriteWidth: spriteBitmap.width,
    spriteHeight: spriteBitmap.height,
    startX: motionTween.startOrigin.x,
    startY: motionTween.startOrigin.y,
    endX: motionTween.endOrigin.x,
    endY: motionTween.endOrigin.y,
    renderCanvas,
    renderCtx,
  };

  motionTweenDebug("buildFrozenTweenPlaybackDescriptor:success", {
    ...baseDebugPayload,
    cacheKey: getFrozenTweenPlaybackKey(layerId, ownerIndex, ownerFrame.stateId),
    spanStartIndex: tweenSpan.spanStartIndex,
    spanEndIndex: tweenSpan.spanEndIndex,
    motionTween: summarizeMotionTweenForDebug(motionTween),
    startX: descriptor.startX,
    startY: descriptor.startY,
    endX: descriptor.endX,
    endY: descriptor.endY,
    zeroMotion: descriptor.startX === descriptor.endX && descriptor.startY === descriptor.endY,
  });

  return {
    status: "success",
    descriptor,
  };
};

const buildFrozenTweenPlaybackCache = (layers: WorkspaceLayer[]): FrozenTweenPlaybackCache => {
  const cache: FrozenTweenPlaybackCache = new Map();

  for (const layer of layers) {
    layer.timelineFrames.forEach((frame, frameIndex) => {
      if (!isFrameStateStart(frame)) {
        return;
      }

      const descriptorResult = buildFrozenTweenPlaybackDescriptor(layer.id, layer.timelineFrames, frameIndex);
      if (descriptorResult.status !== "success") {
        motionTweenWarn("buildFrozenTweenPlaybackCache:skipped-invalid-owner", {
          cacheKey: getFrozenTweenPlaybackKey(layer.id, frameIndex, frame.stateId),
          layerId: layer.id,
          ownerIndex: frameIndex,
          stateId: frame.stateId,
          reason: descriptorResult.reason,
          ...descriptorResult.debugMeta,
        });
        return;
      }
      const { descriptor } = descriptorResult;

      const cacheKey = getFrozenTweenPlaybackKey(layer.id, frameIndex, descriptor.stateId);
      cache.set(cacheKey, descriptor);
      motionTweenDebug("buildFrozenTweenPlaybackCache:stored", {
        cacheKey,
        layerId: layer.id,
        ownerIndex: frameIndex,
        stateId: descriptor.stateId,
        startX: descriptor.startX,
        startY: descriptor.startY,
        endX: descriptor.endX,
        endY: descriptor.endY,
      });
    });
  }

  motionTweenDebug("buildFrozenTweenPlaybackCache:complete", {
    descriptorCount: cache.size,
    layerCount: layers.length,
  });

  return cache;
};

const renderFrozenTweenPlaybackBitmap = (
  descriptor: FrozenTweenPlaybackDescriptor,
  progress: number,
): HTMLCanvasElement | null => {
  const clampedProgress = Math.max(0, Math.min(progress, 1));
  const renderX = Math.round(lerp(descriptor.startX, descriptor.endX, clampedProgress));
  const renderY = Math.round(lerp(descriptor.startY, descriptor.endY, clampedProgress));
  const { renderCanvas, renderCtx } = descriptor;

  if (renderCanvas.width !== descriptor.stageWidth || renderCanvas.height !== descriptor.stageHeight) {
    renderCanvas.width = descriptor.stageWidth;
    renderCanvas.height = descriptor.stageHeight;
  }

  renderCtx.setTransform(1, 0, 0, 1, 0, 0);
  renderCtx.clearRect(0, 0, descriptor.stageWidth, descriptor.stageHeight);
  renderCtx.imageSmoothingEnabled = false;
  renderCtx.drawImage(
    descriptor.spriteCanvas,
    0,
    0,
    descriptor.spriteWidth,
    descriptor.spriteHeight,
    renderX,
    renderY,
    descriptor.spriteWidth,
    descriptor.spriteHeight,
  );

  return renderCanvas;
};

const resolveTimelineBitmap = (
  frames: WorkspaceTimelineFrame[],
  frameIndex: number,
  options?: { tweenEditContext?: TweenEditContext | null },
) => {
  const frame = frames[frameIndex];
  if (!frame || frame.cellType === "empty" || frame.cellType === "blank-keyframe") return null;

  const stateStartIndex = resolveStateStartIndex(frames, frameIndex);
  const stateStartFrame = stateStartIndex >= 0 ? frames[stateStartIndex] : null;
  if (!stateStartFrame) return null;
  const stateStartBitmap = getUsableBitmap(stateStartFrame.bitmap);

  if (frame.cellType !== "tween") {
    return stateStartBitmap;
  }

  const tweenSpan = resolveTweenSpan(frames, frameIndex);
  if (!tweenSpan) {
    return stateStartBitmap;
  }

  const endBitmap = tweenSpan.hasSavedEndBitmap ? getUsableBitmap(tweenSpan.ownerFrame.tweenEndBitmap) : null;
  const editSide = resolveTweenEditSide(frames, frameIndex, options?.tweenEditContext);
  if (editSide === "end") {
    return endBitmap ?? createBlankBitmapLike(stateStartBitmap);
  }

  return stateStartBitmap;
};

const resolveTimelineTextObjects = (frames: WorkspaceTimelineFrame[], frameIndex: number) => {
  const frame = frames[frameIndex] ?? null;
  if (!frame || frame.cellType === "empty" || frame.cellType === "blank-keyframe") {
    return EMPTY_DRAWING_TEXT_OBJECTS;
  }

  const stateStartIndex = resolveStateStartIndex(frames, frameIndex);
  const stateStartFrame = stateStartIndex >= 0 ? frames[stateStartIndex] : null;
  return stateStartFrame?.textObjects ?? EMPTY_DRAWING_TEXT_OBJECTS;
};

const resolvePlaybackTimelineBitmap = (
  layer: WorkspaceLayer,
  frameIndex: number,
  frozenTweenPlaybackCache: FrozenTweenPlaybackCache,
): PlaybackBitmapResolution => {
  const frames = layer.timelineFrames;
  const frame = frames[frameIndex];
  const textObjects = resolveTimelineTextObjects(frames, frameIndex);
  if (!frame || frame.cellType === "empty") {
    return { bitmap: null, drawSource: null, textObjects: EMPTY_DRAWING_TEXT_OBJECTS, renderSource: "null" };
  }

  const stateStartIndex = resolveStateStartIndex(frames, frameIndex);
  const stateStartFrame = stateStartIndex >= 0 ? frames[stateStartIndex] : null;
  if (!stateStartFrame) {
    return { bitmap: null, drawSource: null, textObjects: EMPTY_DRAWING_TEXT_OBJECTS, renderSource: "null" };
  }

  if (frame.cellType !== "tween") {
    return { bitmap: stateStartFrame.bitmap ?? null, drawSource: null, textObjects, renderSource: "non_tween_bitmap" };
  }

  const tweenSpan = resolveTweenSpan(frames, frameIndex);
  const ownerIndex = tweenSpan?.ownerIndex ?? stateStartIndex;
  const ownerStateId = tweenSpan?.ownerFrame.stateId ?? stateStartFrame.stateId;
  const cacheKey = getFrozenTweenPlaybackKey(layer.id, ownerIndex, ownerStateId);
  const ownerValidity = classifyMotionTweenOwnerValidity(frames, ownerIndex);
  if (!tweenSpan) {
    const fallbackReason = ownerValidity.reason ?? "missing_tween_span";
    const fallbackPayload = {
      layerId: layer.id,
      frameIndex,
      ownerIndex,
      stateId: frame.stateId,
      cacheKey,
      fallbackReason,
      ...ownerValidity.debugMeta,
    };
    motionTweenWarn("resolvePlaybackTimelineBitmap:fallback", fallbackPayload);
    return {
      bitmap: null,
      drawSource: null,
      textObjects,
      renderSource: "invalid_motion_tween",
      debugMeta: fallbackPayload,
    };
  }

  const tweenProgress =
    (frameIndex - tweenSpan.spanStartIndex + 1) / (tweenSpan.spanEndIndex - tweenSpan.spanStartIndex + 2);
  const motionTween = tweenSpan.ownerFrame.motionTween;

  if (!ownerValidity.isValid) {
    const fallbackReason = ownerValidity.reason ?? "saved_end_bitmap_not_playback_valid";
    const fallbackPayload = {
      layerId: layer.id,
      frameIndex,
      ownerIndex: tweenSpan.ownerIndex,
      stateId: tweenSpan.ownerFrame.stateId,
      cacheKey,
      tweenProgress,
      fallbackReason,
      ...ownerValidity.debugMeta,
    };
    motionTweenWarn("resolvePlaybackTimelineBitmap:fallback", fallbackPayload);
    return {
      bitmap: null,
      drawSource: null,
      textObjects,
      renderSource: "invalid_motion_tween",
      debugMeta: fallbackPayload,
    };
  }

  let descriptor = frozenTweenPlaybackCache.get(cacheKey);
  let renderSource: PlaybackResolutionSource = "frozen_tween_descriptor";
  let descriptorRecovered = false;

  if (!descriptor) {
    motionTweenError("resolvePlaybackTimelineBitmap:fallback", {
      layerId: layer.id,
      frameIndex,
      ownerIndex: tweenSpan.ownerIndex,
      stateId: tweenSpan.ownerFrame.stateId,
      cacheKey,
      descriptorFound: false,
      tweenProgress,
      fallbackReason: "cache_invariant_miss",
      payloadComplete: true,
      motionTween: summarizeMotionTweenForDebug(motionTween),
      ...ownerValidity.debugMeta,
    });

    const descriptorResult = buildFrozenTweenPlaybackDescriptor(layer.id, frames, tweenSpan.ownerIndex);
    if (descriptorResult.status !== "success") {
      const fallbackPayload = {
        layerId: layer.id,
        frameIndex,
        ownerIndex: tweenSpan.ownerIndex,
        stateId: tweenSpan.ownerFrame.stateId,
        cacheKey,
        descriptorFound: false,
        tweenProgress,
        fallbackReason: "descriptor_recovery_failed",
        descriptorFailureReason: descriptorResult.reason,
        motionTween: summarizeMotionTweenForDebug(motionTween),
        ...ownerValidity.debugMeta,
      };
      motionTweenError("resolvePlaybackTimelineBitmap:fallback", fallbackPayload);
      return {
        bitmap: null,
        drawSource: null,
        textObjects,
        renderSource: "invalid_motion_tween",
        debugMeta: fallbackPayload,
      };
    }

    descriptor = descriptorResult.descriptor;
    frozenTweenPlaybackCache.set(cacheKey, descriptor);
    renderSource = "recovered_motion_descriptor";
    descriptorRecovered = true;
  }

  const renderedBitmap = renderFrozenTweenPlaybackBitmap(descriptor, tweenProgress);
  const zeroMotion = descriptor.startX === descriptor.endX && descriptor.startY === descriptor.endY;

  motionTweenDebug("resolvePlaybackTimelineBitmap", {
    layerId: layer.id,
    frameIndex,
    ownerIndex: tweenSpan.ownerIndex,
    stateId: tweenSpan.ownerFrame.stateId,
    cacheKey,
    descriptorFound: true,
    descriptorRecovered,
    tweenProgress,
    payloadComplete: true,
    renderSource,
    startX: descriptor.startX,
    startY: descriptor.startY,
    endX: descriptor.endX,
    endY: descriptor.endY,
    zeroMotionDescriptor: zeroMotion,
    renderedBitmap: renderedBitmap
      ? {
          width: renderedBitmap.width,
          height: renderedBitmap.height,
        }
      : null,
  });

  if (!renderedBitmap) {
    const fallbackPayload = {
      layerId: layer.id,
      frameIndex,
      ownerIndex: tweenSpan.ownerIndex,
      stateId: tweenSpan.ownerFrame.stateId,
      cacheKey,
      descriptorFound: true,
      descriptorRecovered,
      tweenProgress,
      fallbackReason: "render_failed",
      renderSource,
      ...ownerValidity.debugMeta,
    };
    motionTweenError("resolvePlaybackTimelineBitmap:fallback", fallbackPayload);
    return {
      bitmap: null,
      drawSource: null,
      textObjects,
      renderSource: "invalid_motion_tween",
      debugMeta: fallbackPayload,
    };
  }

  return {
    bitmap: null,
    drawSource: renderedBitmap,
    textObjects,
    renderSource,
    debugMeta: {
      cacheKey,
      tweenProgress,
      zeroMotionDescriptor: zeroMotion,
      descriptorRecovered,
    },
  };
};

const resolveTimelinePreviewUrl = (
  frames: WorkspaceTimelineFrame[],
  frameIndex: number,
  options?: { tweenEditContext?: TweenEditContext | null },
) => {
  const frame = frames[frameIndex];
  if (!frame || frame.cellType === "empty" || frame.cellType === "blank-keyframe") return null;

  const stateStartIndex = resolveStateStartIndex(frames, frameIndex);
  const stateStartFrame = stateStartIndex >= 0 ? frames[stateStartIndex] : null;
  if (!stateStartFrame) return null;

  if (frame.cellType !== "tween") {
    return stateStartFrame.previewUrl;
  }

  const tweenSpan = resolveTweenSpan(frames, frameIndex);
  if (!tweenSpan) {
    return stateStartFrame.previewUrl;
  }

  const endPreviewUrl = tweenSpan.hasSavedEndBitmap ? tweenSpan.ownerFrame.tweenEndPreviewUrl : null;
  const editSide = resolveTweenEditSide(frames, frameIndex, options?.tweenEditContext);
  if (editSide === "end") {
    return endPreviewUrl;
  }

  return stateStartFrame.previewUrl;
};

const resolveTimelineSnapshot = (
  frames: WorkspaceTimelineFrame[],
  frameIndex: number,
  options?: { tweenEditContext?: TweenEditContext | null },
): TimelineFrameSnapshot => ({
  bitmap: resolveTimelineBitmap(frames, frameIndex, options),
  previewUrl: resolveTimelinePreviewUrl(frames, frameIndex, options),
});

const resolveOnionFramePreview = (
  frames: WorkspaceTimelineFrame[],
  frameIndex: number,
): OnionFramePreview | null => {
  const frame = frames[frameIndex];
  if (!frame || frame.cellType === "empty" || frame.cellType === "blank-keyframe") {
    return null;
  }

  const bitmap = resolveTimelineBitmap(frames, frameIndex);
  const textObjects = resolveTimelineTextObjects(frames, frameIndex);
  if (!bitmap && textObjects.length === 0) {
    return null;
  }

  return {
    bitmap,
    textObjects,
  };
};

const resolveOnionNeighborPreview = (
  frames: WorkspaceTimelineFrame[],
  currentFrameIndex: number,
  direction: "previous" | "next",
  currentPreview?: OnionFramePreview | null,
): OnionFramePreview => {
  if (frames.length === 0) {
    return EMPTY_ONION_FRAME_PREVIEW;
  }

  const normalizedCurrentIndex = Math.max(0, currentFrameIndex);
  if (normalizedCurrentIndex >= frames.length) {
    return EMPTY_ONION_FRAME_PREVIEW;
  }

  const currentStateStartIndex = resolveStateStartIndex(frames, normalizedCurrentIndex);
  const step = direction === "previous" ? -1 : 1;
  const firstCandidateIndex = normalizedCurrentIndex + step;

  for (
    let candidateIndex = firstCandidateIndex;
    candidateIndex >= 0 && candidateIndex < frames.length;
    candidateIndex += step
  ) {
    const candidateFrame = frames[candidateIndex] ?? null;
    if (!candidateFrame || candidateFrame.cellType === "empty" || candidateFrame.cellType === "blank-keyframe") {
      break;
    }

    const candidateStateStartIndex = resolveStateStartIndex(frames, candidateIndex);
    if (candidateStateStartIndex < 0) {
      continue;
    }

    if (currentStateStartIndex >= 0 && candidateStateStartIndex === currentStateStartIndex) {
      continue;
    }

    const preview = resolveOnionFramePreview(frames, candidateIndex);
    if (preview) {
      if (currentPreview && onionFramePreviewsEqual(preview, currentPreview)) {
        continue;
      }

      return preview;
    }
  }

  return EMPTY_ONION_FRAME_PREVIEW;
};

const findTweenGuideSegment = (frames: WorkspaceTimelineFrame[], frameIndex: number) => {
  const tweenSpan = resolveTweenSpan(frames, frameIndex);
  if (!tweenSpan || !tweenSpan.hasSavedEndBitmap) {
    return null;
  }

  return {
    startIndex: tweenSpan.ownerIndex,
    endIndex: tweenSpan.spanEndIndex,
    ownerIndex: tweenSpan.ownerIndex,
  };
};

const reassignTrailingStateCells = (
  frames: WorkspaceTimelineFrame[],
  insertedIndex: number,
  fromStateId: number,
  toStateId: number,
) => {
  for (let index = insertedIndex + 1; index < frames.length; index += 1) {
    const frame = frames[index];
    if (frame.stateId !== fromStateId || isFrameStateStart(frame)) {
      break;
    }

    frames[index] = {
      ...frame,
      stateId: toStateId,
      kind: frame.cellType === "tween" ? "tween" : "frame",
      cellType: frame.cellType === "tween" ? "tween" : "hold",
    };
  }
};

const reassignTrailingStateCellsToHold = (
  frames: WorkspaceTimelineFrame[],
  insertedIndex: number,
  fromStateId: number,
  toStateId: number,
) => {
  for (let index = insertedIndex + 1; index < frames.length; index += 1) {
    const frame = frames[index];
    if (frame.stateId !== fromStateId || isFrameStateStart(frame)) {
      break;
    }

    frames[index] = {
      ...frame,
      stateId: toStateId,
      kind: "frame",
      cellType: "hold",
      hasTweenEndpoint: false,
      tweenEndBitmap: null,
      tweenEndPreviewUrl: null,
      motionTween: null,
    };
  }
};

const convertTrailingStateCellsToTween = (frames: WorkspaceTimelineFrame[], insertedIndex: number, stateId: number) => {
  for (let index = insertedIndex + 1; index < frames.length; index += 1) {
    const frame = frames[index];
    if (frame.stateId !== stateId || isFrameStateStart(frame)) {
      break;
    }

    frames[index] = {
      ...frame,
      kind: "tween",
      cellType: "tween",
    };
  }
};

const fillTimelineRangeWithSpan = (
  frames: WorkspaceTimelineFrame[],
  startIndex: number,
  endIndex: number,
  stateId: number,
  spanType: "frame" | "tween",
  nextTimelineFrameIdRef: MutableRefObject<number>,
) => {
  for (let index = startIndex; index <= endIndex; index += 1) {
    const existingFrame = frames[index];
    const spanFrame =
      existingFrame && existingFrame.cellType === "empty"
        ? {
            ...createSpanContinuationFrame(existingFrame.id, stateId, spanType),
            id: existingFrame.id,
          }
        : createSpanContinuationFrame(nextTimelineFrameIdRef.current++, stateId, spanType);

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

const resizeTimelineSpanCells = (
  frames: WorkspaceTimelineFrame[],
  stateId: number,
  spanType: "frame" | "tween",
  nextEndIndex: number,
  nextTimelineFrameIdRef: MutableRefObject<number>,
) => {
  const stateStartIndex = findStateStartIndex(frames, stateId);
  if (stateStartIndex < 0) {
    return null;
  }

  const spanStartIndex =
    spanType === "tween"
      ? frames.findIndex((frame, index) => index >= stateStartIndex && frame.stateId === stateId && frame.cellType === "tween")
      : stateStartIndex;

  if (spanStartIndex < 0) {
    return null;
  }

  const currentEndIndex =
    spanType === "tween" ? getTweenSegmentBounds(frames, spanStartIndex).endIndex : getFrameDurationEndIndex(frames, stateStartIndex);
  const minimumEndIndex = spanType === "tween" ? spanStartIndex : stateStartIndex;
  const clampedEndIndex = Math.max(minimumEndIndex, nextEndIndex);
  const removedFrameCount = clampedEndIndex < currentEndIndex ? currentEndIndex - clampedEndIndex : 0;
  const removedStartIndex = removedFrameCount > 0 ? clampedEndIndex + 1 : -1;
  const previousLength = frames.length;
  let shiftBoundary = previousLength;

  if (clampedEndIndex > currentEndIndex) {
    const firstInsertedIndex = Array.from(
      { length: Math.max(0, clampedEndIndex - currentEndIndex) },
      (_, offset) => currentEndIndex + 1 + offset,
    ).find((index) => {
      const frame = frames[index];
      return Boolean(frame && frame.cellType !== "empty");
    });
    fillTimelineRangeWithSpan(frames, currentEndIndex + 1, clampedEndIndex, stateId, spanType, nextTimelineFrameIdRef);
    shiftBoundary = firstInsertedIndex ?? previousLength;
  } else if (clampedEndIndex < currentEndIndex) {
    const collapsedRange = collapseTimelineRange(
      frames,
      clampedEndIndex + 1,
      currentEndIndex,
      () => createEmptyTimelineFrame(nextTimelineFrameIdRef.current++),
    );
    frames.splice(0, frames.length, ...collapsedRange.frames);
  }

  return {
    spanStartIndex,
    spanEndIndex: clampedEndIndex,
    stateStartIndex,
    previousEndIndex: currentEndIndex,
    removedFrameCount,
    removedStartIndex,
    insertedCount: Math.max(0, frames.length - previousLength),
    shiftBoundary,
  };
};

  const sameOverlayRect = (a: CanvasOverlayRect | null, b: CanvasOverlayRect | null) =>
  a?.left === b?.left && a?.top === b?.top && a?.width === b?.width && a?.height === b?.height;

const PLAYBACK_INTERACTION_BLOCKER_Z_INDEX = 6;

type DrawingWorkspaceProps = {
  initialProject?: StoredDrawingProject | null;
};

export function DrawingWorkspace({ initialProject = null }: DrawingWorkspaceProps) {
  const initialWorkspaceState = createDrawingWorkspaceInitialState(initialProject);
  const [projectId, setProjectId] = useState<string | null>(initialWorkspaceState.projectId);
  const [projectTitle, setProjectTitle] = useState(initialWorkspaceState.projectTitle);
  const [projectAiMemory, setProjectAiMemory] = useState<DrawingAiProjectMemory | null>(
    bindDrawingAiProjectMemoryToProject(initialProject?.aiMemory ?? null, initialWorkspaceState.projectId),
  );
  const [activeTool, setActiveTool] = useState<DrawingToolName>(initialWorkspaceState.activeTool);
  const [brushSize, setBrushSize] = useState(initialWorkspaceState.brushSize);
  const [eraserSize, setEraserSize] = useState(initialWorkspaceState.eraserSize);
  const [fillColor, setFillColor] = useState(initialWorkspaceState.fillColor);
  const [timelineFps, setTimelineFps] = useState(initialWorkspaceState.timelineFps);
  const [shapeType, setShapeType] = useState<DrawingShapeType>(initialWorkspaceState.shapeType);
  const [layers, setLayers] = useState<WorkspaceLayer[]>(initialWorkspaceState.layers);
  const [activeLayerId, setActiveLayerId] = useState(initialWorkspaceState.activeLayerId);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(initialWorkspaceState.currentFrameIndex);
  const [selectedTimelineIndex, setSelectedTimelineIndex] = useState(initialWorkspaceState.selectedTimelineIndex);
  const [isTimelinePlaying, setIsTimelinePlaying] = useState(false);
  const [isOnionEnabled, setIsOnionEnabled] = useState(initialWorkspaceState.isOnionEnabled);
  const [canvasOverlayRect, setCanvasOverlayRect] = useState<CanvasOverlayRect | null>(null);
  const [saveNotification, setSaveNotification] = useState<{ projectName: string; isVisible: boolean } | null>(null);
  const [canUndoHistory, setCanUndoHistory] = useState(false);
  const [canRedoHistory, setCanRedoHistory] = useState(false);
  const [hasCopiedTimelineFrame, setHasCopiedTimelineFrame] = useState(false);
  const nextTimelineFrameIdRef = useRef(initialWorkspaceState.nextTimelineFrameId);
  const nextLayerNumberRef = useRef(initialWorkspaceState.nextLayerNumber);
  const workspaceAreaRef = useRef<HTMLDivElement | null>(null);
  const workspaceCanvasElementsRef = useRef<
    Partial<Record<"background" | "editable" | "foreground" | "playback", HTMLCanvasElement | null>>
  >({});
  const stageGuideElementRef = useRef<HTMLDivElement | null>(null);
  const playbackSurfaceMetricsRef = useRef<PlaybackSurfaceMetrics | null>(null);
  const drawingCanvasRef = useRef<DrawingCanvasHandle | null>(null);
  const saveCurrentFrameSnapshotRef = useRef<((frameIndex?: number, layerId?: string, options?: {
    captureOptions?: DrawingCanvasSnapshotOptions;
    debugCaller?: string;
    forceCapture?: boolean;
  }) => TimelineFrameSnapshot | null) | null>(null);
  const layersRef = useRef<WorkspaceLayer[]>(layers);
  const timelineRowLayersSourceRef = useRef<WorkspaceLayer[]>(layers);
  const timelineRowLayersViewRef = useRef<TimelineLayer[]>(
    layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      frames: layer.timelineFrames.map(createTimelineRowFrameView),
    })),
  );
  const activeLayerIdRef = useRef(activeLayerId);
  const timelineFramesRef = useRef<WorkspaceTimelineFrame[]>(layers[0]?.timelineFrames ?? []);
  const currentFrameIndexRef = useRef(initialWorkspaceState.currentFrameIndex);
  const selectedTimelineIndexRef = useRef(initialWorkspaceState.selectedTimelineIndex);
  const isTimelinePlayingRef = useRef(false);
  const frozenTweenPlaybackCacheRef = useRef<FrozenTweenPlaybackCache>(new Map());
  const playbackReturnStateRef = useRef<PlaybackReturnState | null>(null);
  const playbackRestorePendingRef = useRef(false);
  const playbackUiSyncAtRef = useRef(0);
  const timelinePlaybackAudioRef = useRef<HTMLAudioElement[]>([]);
  const timelinePlaybackAudioTemplateRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const timelinePlaybackAudioContextRef = useRef<AudioContext | null>(null);
  const timelinePlaybackAudioBufferRef = useRef<Map<string, AudioBuffer>>(new Map());
  const timelinePlaybackSourceRef = useRef<AudioBufferSourceNode[]>([]);
  const resizeCommitSessionRef = useRef<{ key: string } | null>(null);
  const suppressNextWorkspaceAutosaveRef = useRef(false);
  const saveNotificationHideTimeoutRef = useRef<number | null>(null);
  const saveNotificationRemoveTimeoutRef = useRef<number | null>(null);
  const historyEntriesRef = useRef<DrawingWorkspaceHistoryEntry[]>([]);
  const currentHistoryIndexRef = useRef(-1);
  const isApplyingHistoryRef = useRef(false);
  const localDrawingHistoryRef = useRef<Map<string, LocalDrawingHistoryStack>>(new Map());
  const copiedTimelineFrameRef = useRef<CopiedTimelineFrame | null>(null);
  const isApplyingGeneratedFramesRef = useRef(false);
  const lastGeneratedFrameApplyAtRef = useRef(0);
  const historyWorkspaceStampRef = useRef<{
    kind: "global" | "local-drawing";
    layers: WorkspaceLayer[];
    activeLayerId: string;
    currentFrameIndex: number;
    selectedTimelineIndex: number;
    nextTimelineFrameId: number;
    nextLayerNumber: number;
    historyIndex: number;
  } | null>(null);

  const updateHistoryWorkspaceStamp = useCallback((kind: "global" | "local-drawing" = "global") => {
    historyWorkspaceStampRef.current = {
      kind,
      layers: layersRef.current,
      activeLayerId: activeLayerIdRef.current,
      currentFrameIndex: currentFrameIndexRef.current,
      selectedTimelineIndex: selectedTimelineIndexRef.current,
      nextTimelineFrameId: nextTimelineFrameIdRef.current,
      nextLayerNumber: nextLayerNumberRef.current,
      historyIndex: currentHistoryIndexRef.current,
    };
  }, []);

  const isCurrentWorkspaceStampedInHistory = useCallback(() => {
    const stamp = historyWorkspaceStampRef.current;
    return Boolean(
      stamp &&
        stamp.kind === "global" &&
        stamp.historyIndex === currentHistoryIndexRef.current &&
        stamp.layers === layersRef.current &&
        stamp.activeLayerId === activeLayerIdRef.current &&
        stamp.currentFrameIndex === currentFrameIndexRef.current &&
        stamp.selectedTimelineIndex === selectedTimelineIndexRef.current &&
        stamp.nextTimelineFrameId === nextTimelineFrameIdRef.current &&
        stamp.nextLayerNumber === nextLayerNumberRef.current,
    );
  }, []);

  const isCurrentWorkspaceStampedLocally = useCallback(() => {
    const stamp = historyWorkspaceStampRef.current;
    return Boolean(
      stamp &&
        stamp.kind === "local-drawing" &&
        stamp.historyIndex === currentHistoryIndexRef.current &&
        stamp.layers === layersRef.current &&
        stamp.activeLayerId === activeLayerIdRef.current &&
        stamp.currentFrameIndex === currentFrameIndexRef.current &&
        stamp.selectedTimelineIndex === selectedTimelineIndexRef.current &&
        stamp.nextTimelineFrameId === nextTimelineFrameIdRef.current &&
        stamp.nextLayerNumber === nextLayerNumberRef.current,
    );
  }, []);

  const clearLocalDrawingHistory = useCallback(() => {
    localDrawingHistoryRef.current = new Map();
  }, []);

  const resolveLocalDrawingHistoryContext = useCallback(
    (layerId = activeLayerIdRef.current, frameIndex = currentFrameIndexRef.current): LocalDrawingHistoryContext | null => {
      const layer = getLayerById(layersRef.current, layerId) ?? null;
      if (!layer) {
        return null;
      }

      const viewFrame = layer.timelineFrames[frameIndex] ?? null;
      if (!viewFrame) {
        return null;
      }

      const tweenEditContext = resolveTweenEditContext(layer.timelineFrames, frameIndex, layerId);
      if (tweenEditContext?.side === "end") {
        const ownerFrame = layer.timelineFrames[tweenEditContext.ownerIndex] ?? null;
        if (!ownerFrame) {
          return null;
        }

        return {
          key: `${layerId}:${viewFrame.id}:tween-end`,
          layerId,
          viewFrameId: viewFrame.id,
          targetFrameId: ownerFrame.id,
          target: "tweenEndBitmap",
        };
      }

      const stateStartIndex = resolveStateStartIndex(layer.timelineFrames, frameIndex);
      const targetFrame = layer.timelineFrames[stateStartIndex] ?? viewFrame;

      return {
        key: `${layerId}:${viewFrame.id}:bitmap`,
        layerId,
        viewFrameId: viewFrame.id,
        targetFrameId: targetFrame.id,
        target: "bitmap",
      };
    },
    [],
  );

  const getCurrentLocalDrawingHistoryAvailability = useCallback(() => {
    const context = resolveLocalDrawingHistoryContext();
    if (!context) {
      return {
        canUndo: false,
        canRedo: false,
        blocksGlobalTraversal: false,
      };
    }

    const stack = localDrawingHistoryRef.current.get(context.key) ?? null;
    if (!stack) {
      return {
        canUndo: false,
        canRedo: false,
        blocksGlobalTraversal: false,
      };
    }

    const currentLayer = getLayerById(layersRef.current, context.layerId) ?? null;
    const hasEntryTarget = (entry: LocalDrawingHistoryEntry | null | undefined) =>
      Boolean(entry && currentLayer && findTimelineFrameIndexById(currentLayer.timelineFrames, entry.targetFrameId) >= 0);

    return {
      canUndo: stack.position >= 0 && hasEntryTarget(stack.entries[stack.position]),
      canRedo: stack.position < stack.entries.length - 1 && hasEntryTarget(stack.entries[stack.position + 1]),
      blocksGlobalTraversal: stack.blocksGlobalTraversal && stack.position < 0,
    };
  }, [resolveLocalDrawingHistoryContext]);

  const findRelevantHistoryIndexForCurrentContext = useCallback(
    (direction: "undo" | "redo") => {
      const historyEntries = historyEntriesRef.current;
      const currentHistoryIndex = currentHistoryIndexRef.current;
      const currentEntry = currentHistoryIndex >= 0 ? historyEntries[currentHistoryIndex] ?? null : null;
      if (!currentEntry) {
        return -1;
      }

      const contextLayerId = activeLayerIdRef.current;
      const contextFrameIndices = Array.from(
        new Set([currentFrameIndexRef.current, selectedTimelineIndexRef.current].filter((index) => index >= 0)),
      );
      const step = direction === "undo" ? -1 : 1;

      for (
        let historyIndex = currentHistoryIndex + step;
        historyIndex >= 0 && historyIndex < historyEntries.length;
        historyIndex += step
      ) {
        const candidateEntry = historyEntries[historyIndex] ?? null;
        if (!candidateEntry) {
          continue;
        }

        if (candidateEntry.owner.kind === "local-drawing") {
          continue;
        }

        if (
          candidateEntry.owner.kind === "global" &&
          !workspaceLayersStructureEqual(currentEntry.layers, candidateEntry.layers)
        ) {
          return historyIndex;
        }

        const isRelevant = contextFrameIndices.some((frameIndex) => {
          const currentEditingContext = resolveHistoryEditingContext(currentEntry, contextLayerId, frameIndex);
          const candidateEditingContext = resolveHistoryEditingContext(candidateEntry, contextLayerId, frameIndex);
          return !historyEditingContextsEqual(currentEditingContext, candidateEditingContext);
        });

        if (isRelevant) {
          return historyIndex;
        }
      }

      return -1;
    },
    [],
  );

  const syncHistoryAvailability = useCallback(() => {
    const localAvailability = getCurrentLocalDrawingHistoryAvailability();
    const canUndoFromGlobal =
      !localAvailability.canUndo &&
      !localAvailability.blocksGlobalTraversal &&
      findRelevantHistoryIndexForCurrentContext("undo") >= 0;
    const canRedoFromGlobal =
      !localAvailability.canRedo &&
      !localAvailability.blocksGlobalTraversal &&
      findRelevantHistoryIndexForCurrentContext("redo") >= 0;

    setCanUndoHistory(localAvailability.canUndo || canUndoFromGlobal);
    setCanRedoHistory(localAvailability.canRedo || canRedoFromGlobal);
  }, [findRelevantHistoryIndexForCurrentContext, getCurrentLocalDrawingHistoryAvailability]);

  const initializeHistoryTimeline = useCallback(
    (entry: DrawingWorkspaceHistoryEntry) => {
      historyEntriesRef.current = [entry];
      currentHistoryIndexRef.current = 0;
      clearLocalDrawingHistory();
      setCanUndoHistory(false);
      setCanRedoHistory(false);
      updateHistoryWorkspaceStamp();
    },
    [clearLocalDrawingHistory, updateHistoryWorkspaceStamp],
  );

  const createHistoryEntryFromWorkspace = useCallback(
    (owner: DrawingWorkspaceHistoryOwner = { kind: "global" }): DrawingWorkspaceHistoryEntry => ({
      layers: layersRef.current,
      activeLayerId: activeLayerIdRef.current,
      currentFrameIndex: currentFrameIndexRef.current,
      selectedTimelineIndex: selectedTimelineIndexRef.current,
      nextTimelineFrameId: nextTimelineFrameIdRef.current,
      nextLayerNumber: nextLayerNumberRef.current,
      owner,
    }),
    [],
  );

  const trimGlobalHistoryEntriesToLimit = useCallback(() => {
    const historyEntries = historyEntriesRef.current;
    if (historyEntries.length <= MAX_GLOBAL_HISTORY_ENTRIES) {
      return;
    }

    const currentHistoryIndex = currentHistoryIndexRef.current;
    if (currentHistoryIndex < 0) {
      historyEntriesRef.current = historyEntries.slice(-MAX_GLOBAL_HISTORY_ENTRIES);
      historyWorkspaceStampRef.current = null;
      return;
    }

    const maxEntries = MAX_GLOBAL_HISTORY_ENTRIES;
    let startIndex = Math.max(0, currentHistoryIndex - Math.floor((maxEntries - 1) / 2));
    let endIndex = Math.min(historyEntries.length, startIndex + maxEntries);
    startIndex = Math.max(0, endIndex - maxEntries);
    endIndex = Math.min(historyEntries.length, startIndex + maxEntries);

    if (startIndex === 0 && endIndex === historyEntries.length) {
      return;
    }

    historyEntriesRef.current = historyEntries.slice(startIndex, endIndex);
    currentHistoryIndexRef.current = Math.max(0, currentHistoryIndex - startIndex);
    historyWorkspaceStampRef.current = null;
  }, []);

  const commitHistoryEntry = useCallback(
    (
      entry: DrawingWorkspaceHistoryEntry,
      options?: {
        skipCurrentEqualityCheck?: boolean;
        skipFutureEqualityCheck?: boolean;
      },
    ) => {
      const nextEntry = entry;
      const historyEntries = historyEntriesRef.current;
      const currentHistoryIndex = currentHistoryIndexRef.current;

      if (currentHistoryIndex < 0 || historyEntries.length === 0) {
        initializeHistoryTimeline(nextEntry);
        return currentHistoryIndexRef.current;
      }

      const currentEntry = historyEntries[currentHistoryIndex] ?? null;
      if (!options?.skipCurrentEqualityCheck && currentEntry && historyEntriesEqual(currentEntry, nextEntry)) {
        syncHistoryAvailability();
        return currentHistoryIndex;
      }

      const immediateFutureEntry = historyEntries[currentHistoryIndex + 1] ?? null;
      if (!options?.skipFutureEqualityCheck && immediateFutureEntry && historyEntriesEqual(immediateFutureEntry, nextEntry)) {
        currentHistoryIndexRef.current = currentHistoryIndex + 1;
        syncHistoryAvailability();
        return currentHistoryIndexRef.current;
      }

      historyEntriesRef.current = [
        ...historyEntries.slice(0, currentHistoryIndex + 1),
        nextEntry,
      ];
      currentHistoryIndexRef.current = currentHistoryIndex + 1;
      trimGlobalHistoryEntriesToLimit();
      syncHistoryAvailability();
      return currentHistoryIndexRef.current;
    },
    [initializeHistoryTimeline, syncHistoryAvailability, trimGlobalHistoryEntriesToLimit],
  );

  const recordUndoSnapshot = useCallback(() => {
    if (isApplyingHistoryRef.current) {
      return currentHistoryIndexRef.current;
    }

    if (isCurrentWorkspaceStampedInHistory()) {
      return currentHistoryIndexRef.current;
    }

    const nextHistoryIndex = commitHistoryEntry(createHistoryEntryFromWorkspace());
    updateHistoryWorkspaceStamp();
    return nextHistoryIndex;
  }, [commitHistoryEntry, createHistoryEntryFromWorkspace, isCurrentWorkspaceStampedInHistory, updateHistoryWorkspaceStamp]);

  const commitCurrentHistoryState = useCallback((options?: {
    assumeChanged?: boolean;
    owner?: DrawingWorkspaceHistoryOwner;
  }) => {
    if (isApplyingHistoryRef.current) {
      return currentHistoryIndexRef.current;
    }

    if (currentHistoryIndexRef.current < 0 || historyEntriesRef.current.length === 0) {
      initializeHistoryTimeline(createHistoryEntryFromWorkspace());
    }

    if (options?.owner?.kind !== "local-drawing") {
      clearLocalDrawingHistory();
    }

    if (options?.owner?.kind === "local-drawing") {
      updateHistoryWorkspaceStamp("local-drawing");
      syncHistoryAvailability();
      return currentHistoryIndexRef.current;
    }

    const nextHistoryIndex = commitHistoryEntry(
      createHistoryEntryFromWorkspace(options?.owner ?? { kind: "global" }),
      options?.assumeChanged
        ? {
            skipCurrentEqualityCheck: true,
            skipFutureEqualityCheck: true,
          }
        : undefined,
    );
    updateHistoryWorkspaceStamp();
    return nextHistoryIndex;
  }, [
    clearLocalDrawingHistory,
    commitHistoryEntry,
    createHistoryEntryFromWorkspace,
    initializeHistoryTimeline,
    syncHistoryAvailability,
    updateHistoryWorkspaceStamp,
  ]);

  useEffect(() => {
    if (currentHistoryIndexRef.current >= 0) {
      return;
    }

    initializeHistoryTimeline(createHistoryEntryFromWorkspace());
  }, [createHistoryEntryFromWorkspace, initializeHistoryTimeline]);

  useEffect(() => {
    if (!initialProject) {
      return;
    }

    let isCancelled = false;

    void hydrateStoredProjectLayers(initialProject).then((hydratedLayers) => {
      if (isCancelled || hydratedLayers.length === 0) {
        return;
      }

      const maxTimelineIndex = Math.max(0, getGlobalTimelineFrameCount(hydratedLayers) - 1);
      const resolvedActiveLayer = getLayerById(hydratedLayers, initialProject.data.activeLayerId) ?? hydratedLayers[0];
      const nextCurrentFrameIndex = Math.max(0, Math.min(initialProject.data.currentFrameIndex ?? 0, maxTimelineIndex));
      const nextSelectedTimelineIndex = Math.max(
        0,
        Math.min(initialProject.data.selectedTimelineIndex ?? 0, maxTimelineIndex),
      );

      layersRef.current = hydratedLayers;
      activeLayerIdRef.current = resolvedActiveLayer.id;
      timelineFramesRef.current = resolvedActiveLayer.timelineFrames;
      currentFrameIndexRef.current = nextCurrentFrameIndex;
      selectedTimelineIndexRef.current = nextSelectedTimelineIndex;
      setLayers(hydratedLayers);
      setActiveLayerId(resolvedActiveLayer.id);
      setCurrentFrameIndex(nextCurrentFrameIndex);
      setSelectedTimelineIndex(nextSelectedTimelineIndex);
      initializeHistoryTimeline({
        layers: hydratedLayers,
        activeLayerId: resolvedActiveLayer.id,
        currentFrameIndex: nextCurrentFrameIndex,
        selectedTimelineIndex: nextSelectedTimelineIndex,
        nextTimelineFrameId: nextTimelineFrameIdRef.current,
        nextLayerNumber: nextLayerNumberRef.current,
        owner: { kind: "global" },
      });
    });

    return () => {
      isCancelled = true;
    };
  }, [initialProject, initializeHistoryTimeline]);

  useEffect(() => {
    setProjectId(initialProject?.id ?? null);
    setProjectTitle(initialProject?.name ?? DEFAULT_PROJECT_TITLE);
    setProjectAiMemory(bindDrawingAiProjectMemoryToProject(initialProject?.aiMemory ?? null, initialProject?.id ?? null));
  }, [initialProject]);

  useEffect(() => {
    if (!projectId) {
      return;
    }

    let cancelled = false;

    void loadDrawingProjectAiMemoryFromSupabase(projectId).then((remoteMemory) => {
      if (cancelled || !remoteMemory) {
        return;
      }

      setProjectAiMemory((currentMemory) => {
        const preferredMemory = chooseNewerDrawingAiProjectMemory(currentMemory, remoteMemory, projectId);
        if (preferredMemory === remoteMemory) {
          updateStoredDrawingProjectAiMemory(projectId, remoteMemory);
        }
        return preferredMemory;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!projectId) {
      return;
    }

    const scopedMemory = bindDrawingAiProjectMemoryToProject(projectAiMemory, projectId);
    updateStoredDrawingProjectAiMemory(projectId, scopedMemory);
    if (scopedMemory) {
      void saveDrawingProjectAiMemoryToSupabase(projectId, scopedMemory).then((saveResult) => {
        if (saveResult !== "rejected-stale") {
          return;
        }

        void loadDrawingProjectAiMemoryFromSupabase(projectId).then((remoteMemory) => {
          if (!remoteMemory) {
            return;
          }

          setProjectAiMemory((currentMemory) => {
            const preferredMemory = chooseNewerDrawingAiProjectMemory(currentMemory, remoteMemory, projectId);
            if (preferredMemory === remoteMemory) {
              updateStoredDrawingProjectAiMemory(projectId, remoteMemory);
            }
            return preferredMemory;
          });
        });
      });
    } else {
      void deleteDrawingProjectAiMemoryFromSupabase(projectId);
    }
  }, [projectAiMemory, projectId]);

  const activeLayer = useMemo(() => getLayerById(layers, activeLayerId) ?? layers[0] ?? null, [activeLayerId, layers]);
  const timelineFrames = activeLayer?.timelineFrames ?? EMPTY_TIMELINE_FRAMES;
  const activeTweenEditContext = useMemo(
    () => (activeLayer ? resolveTweenEditContext(activeLayer.timelineFrames, currentFrameIndex, activeLayer.id) : null),
    [activeLayer, currentFrameIndex],
  );
  const drawingEditingContextKey = useMemo(
    () =>
      activeTweenEditContext
        ? `${activeTweenEditContext.layerId}:tween:${activeTweenEditContext.stateId}:${activeTweenEditContext.side}`
        : `${activeLayerId}:frame:${currentFrameIndex}`,
    [activeLayerId, activeTweenEditContext, currentFrameIndex],
  );
  const timelineRowLayers = useMemo<TimelineLayer[]>(() => {
    const previousSourceLayers = timelineRowLayersSourceRef.current;
    const previousTimelineLayers = timelineRowLayersViewRef.current;

    if (previousSourceLayers === layers && previousTimelineLayers.length === layers.length) {
      return previousTimelineLayers;
    }

    const nextTimelineLayers = layers.map((layer, layerIndex) => {
      const previousSourceLayer = previousSourceLayers[layerIndex] ?? null;
      const previousTimelineLayer = previousTimelineLayers[layerIndex] ?? null;

      if (previousSourceLayer === layer && previousTimelineLayer) {
        return previousTimelineLayer;
      }

      const previousFrames = previousTimelineLayer?.frames ?? [];
      let didLayerChange =
        !previousTimelineLayer ||
        previousTimelineLayer.id !== layer.id ||
        previousTimelineLayer.name !== layer.name ||
        previousFrames.length !== layer.timelineFrames.length;

      const nextFrames = layer.timelineFrames.map((frame, frameIndex) => {
        const previousFrame = previousFrames[frameIndex] ?? null;
        if (previousFrame && timelineFrameMatchesRowView(frame, previousFrame)) {
          return previousFrame;
        }

        didLayerChange = true;
        return createTimelineRowFrameView(frame);
      });

      if (!didLayerChange && previousTimelineLayer) {
        return previousTimelineLayer;
      }

      return {
        id: layer.id,
        name: layer.name,
        frames: nextFrames,
      };
    });

    const canReusePreviousTimelineLayers =
      previousTimelineLayers.length === nextTimelineLayers.length &&
      nextTimelineLayers.every((layer, layerIndex) => layer === previousTimelineLayers[layerIndex]);

    timelineRowLayersSourceRef.current = layers;
    if (canReusePreviousTimelineLayers) {
      return previousTimelineLayers;
    }

    timelineRowLayersViewRef.current = nextTimelineLayers;
    return nextTimelineLayers;
  }, [layers]);
  const authoredPlaybackFrameCount = useMemo(
    () => getAuthoredPlaybackFrameCountForTimelineLayers(timelineRowLayers),
    [timelineRowLayers],
  );
  const playbackRenderScale = useMemo(
    () =>
      resolvePlaybackRenderScale({
        authoredFrameCount: authoredPlaybackFrameCount,
        totalLayerCount: layers.length,
        timelineFps,
      }),
    [authoredPlaybackFrameCount, layers.length, timelineFps],
  );

  useEffect(() => {
    layersRef.current = layers;
    const resolvedActiveLayer = getLayerById(layers, activeLayerIdRef.current) ?? layers[0] ?? null;
    if (resolvedActiveLayer) {
      timelineFramesRef.current = resolvedActiveLayer.timelineFrames;
      if (activeLayerIdRef.current !== resolvedActiveLayer.id) {
        activeLayerIdRef.current = resolvedActiveLayer.id;
        setActiveLayerId(resolvedActiveLayer.id);
      }
    } else {
      timelineFramesRef.current = [];
    }
  }, [layers]);

  useEffect(() => {
    activeLayerIdRef.current = activeLayerId;
    timelineFramesRef.current = activeLayer?.timelineFrames ?? [];
  }, [activeLayer, activeLayerId]);

  useEffect(() => {
    currentFrameIndexRef.current = currentFrameIndex;
  }, [currentFrameIndex]);

  useEffect(() => {
    selectedTimelineIndexRef.current = selectedTimelineIndex;
  }, [selectedTimelineIndex]);

  useEffect(() => {
    syncHistoryAvailability();
  }, [activeLayerId, currentFrameIndex, layers, selectedTimelineIndex, syncHistoryAvailability]);

  useEffect(
    () => () => {
      if (saveNotificationHideTimeoutRef.current) {
        window.clearTimeout(saveNotificationHideTimeoutRef.current);
      }

      if (saveNotificationRemoveTimeoutRef.current) {
        window.clearTimeout(saveNotificationRemoveTimeoutRef.current);
      }
    },
    [],
  );

  const showSaveNotification = useCallback((nextProjectName: string) => {
    if (saveNotificationHideTimeoutRef.current) {
      window.clearTimeout(saveNotificationHideTimeoutRef.current);
    }

    if (saveNotificationRemoveTimeoutRef.current) {
      window.clearTimeout(saveNotificationRemoveTimeoutRef.current);
    }

    setSaveNotification({
      projectName: nextProjectName,
      isVisible: true,
    });

    saveNotificationHideTimeoutRef.current = window.setTimeout(() => {
      setSaveNotification((currentNotification) =>
        currentNotification
          ? {
              ...currentNotification,
              isVisible: false,
            }
          : null,
      );
    }, 2200);

    saveNotificationRemoveTimeoutRef.current = window.setTimeout(() => {
      setSaveNotification(null);
    }, 2480);
  }, []);

  useEffect(() => {
    motionTweenDebug("DrawingWorkspace:frame-state:post-update", {
      currentFrameIndex,
      selectedTimelineIndex,
      activeTweenEditContext,
      derivedSide: activeTweenEditContext?.side ?? null,
    });
  }, [activeTweenEditContext, currentFrameIndex, selectedTimelineIndex]);

  useEffect(() => {
    isTimelinePlayingRef.current = isTimelinePlaying;
  }, [isTimelinePlaying]);

  useEffect(() => {
    if (!isTimelinePlaying) {
      frozenTweenPlaybackCacheRef.current = new Map();
    }
  }, [isTimelinePlaying]);

  useEffect(() => {
    const clearResizeCommitSession = (reason: "pointerup" | "pointercancel") => {
      if (!resizeCommitSessionRef.current) {
        return;
      }

      motionTweenDebug("resizeTimelineSpan:resize-session-end", {
        sessionKey: resizeCommitSessionRef.current.key,
        reason,
      });
      resizeCommitSessionRef.current = null;
    };

    const handlePointerUp = () => clearResizeCommitSession("pointerup");
    const handlePointerCancel = () => clearResizeCommitSession("pointercancel");

    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);

    return () => {
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
    };
  }, []);

  const getWorkspaceCanvas = useCallback((role: "background" | "editable" | "foreground" | "playback") => {
    const cachedCanvas = workspaceCanvasElementsRef.current[role];
    if (cachedCanvas?.isConnected) {
      return cachedCanvas;
    }

    const root = workspaceAreaRef.current;
    if (!root) return null;

    const resolvedCanvas = root.querySelector(`canvas[data-workspace-canvas="${role}"]`) as HTMLCanvasElement | null;
    workspaceCanvasElementsRef.current[role] = resolvedCanvas;
    return resolvedCanvas;
  }, []);

  const getWorkspaceStageGuide = useCallback(() => {
    const cachedGuide = stageGuideElementRef.current;
    if (cachedGuide?.isConnected) {
      return cachedGuide;
    }

    const root = workspaceAreaRef.current;
    if (!root) return null;

    const resolvedGuide = root.querySelector('[data-workspace-stage-guide="camera"]') as HTMLDivElement | null;
    stageGuideElementRef.current = resolvedGuide;
    return resolvedGuide;
  }, []);

  const getDrawingCanvas = useCallback(() => getWorkspaceCanvas("editable"), [getWorkspaceCanvas]);
  const getBackgroundCanvas = useCallback(() => getWorkspaceCanvas("background"), [getWorkspaceCanvas]);
  const getForegroundCanvas = useCallback(() => getWorkspaceCanvas("foreground"), [getWorkspaceCanvas]);
  const getPlaybackCanvas = useCallback(() => getWorkspaceCanvas("playback"), [getWorkspaceCanvas]);

  const measureCanvasOverlayRect = useCallback(() => {
    const root = workspaceAreaRef.current;
    const stageGuide = getWorkspaceStageGuide();
    if (!root || !stageGuide) return null;

    const rootRect = root.getBoundingClientRect();
    const stageRect = stageGuide.getBoundingClientRect();
    if (stageRect.width <= 0 || stageRect.height <= 0) return null;

    return {
      left: stageRect.left - rootRect.left,
      top: stageRect.top - rootRect.top,
      width: stageRect.width,
      height: stageRect.height,
    };
  }, [getWorkspaceStageGuide]);

  const invalidatePlaybackSurfaceMetrics = useCallback(() => {
    playbackSurfaceMetricsRef.current = null;
  }, []);

  useEffect(() => {
    const handleResize = () => {
      workspaceCanvasElementsRef.current = {};
      stageGuideElementRef.current = null;
      invalidatePlaybackSurfaceMetrics();
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [invalidatePlaybackSurfaceMetrics]);

  const captureCanvasSnapshot = useCallback((options?: DrawingCanvasSnapshotOptions): DrawingCanvasSnapshot | null => {
    const authoredSnapshot = drawingCanvasRef.current?.captureAuthoringSnapshot(options);
    if (authoredSnapshot) {
      if (ENABLE_MOTION_TWEEN_DEBUG) {
        motionTweenDebug("captureCanvasSnapshot", {
          source: "drawingCanvasRef",
          includePreviewUrl: options?.includePreviewUrl !== false,
          snapshot: summarizeBitmapForMotionTweenDebug(authoredSnapshot.bitmap),
        });
      }
      return authoredSnapshot;
    }

    const canvas = getDrawingCanvas();
    const compositeCtx = canvas?.getContext("2d");
    if (!canvas || !compositeCtx) return null;

    const includePreviewUrl = options?.includePreviewUrl !== false;
    const fallbackBitmap = compositeCtx.getImageData(0, 0, canvas.width, canvas.height);
    const fallbackSnapshot = {
      bitmap: fallbackBitmap,
      previewUrl: includePreviewUrl ? createLiveBitmapPreviewUrl(fallbackBitmap) : undefined,
    };
    if (ENABLE_MOTION_TWEEN_DEBUG) {
      motionTweenWarn("captureCanvasSnapshot:fallback", {
        source: "editableCanvas",
        includePreviewUrl,
        snapshot: summarizeBitmapForMotionTweenDebug(fallbackSnapshot.bitmap),
      });
    }
    return fallbackSnapshot;
  }, [getDrawingCanvas]);

  const renderBitmapsToTargetCanvas = useCallback((canvas: HTMLCanvasElement | null, bitmaps: ReadonlyArray<ImageData | null>) => {
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;

    for (const bitmap of bitmaps) {
      if (!bitmap) {
        continue;
      }

      const sourceCanvas = createBitmapCanvas(bitmap);
      if (!sourceCanvas) {
        continue;
      }

      drawBitmapCanvasCentered(ctx, sourceCanvas, canvas.width, canvas.height);
    }

    ctx.restore();
  }, []);

  const restoreBitmapToTargetCanvas = useCallback((canvas: HTMLCanvasElement | null, bitmap: ImageData | null) => {
    renderBitmapsToTargetCanvas(canvas, [bitmap]);
  }, [renderBitmapsToTargetCanvas]);

  const restoreBitmapToCanvas = useCallback(
    (bitmap: ImageData | null) => {
      if (drawingCanvasRef.current?.hasActiveBitmapSelectionSession()) {
        drawingCanvasRef.current?.markAuthoringChangesCommitted(bitmap);
        return;
      }

      const canvas = getDrawingCanvas();
      restoreBitmapToTargetCanvas(canvas, bitmap);
      drawingCanvasRef.current?.markAuthoringChangesCommitted(bitmap);
    },
    [getDrawingCanvas, restoreBitmapToTargetCanvas],
  );

  const renderBitmapToPlaybackCanvas = useCallback(
    (_bitmap: ImageData | null) => {
      const canvas = getPlaybackCanvas();
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    },
    [getPlaybackCanvas],
  );

  const getPlaybackSurfaceMetrics = useCallback((): PlaybackSurfaceMetrics | null => {
    const playbackCanvas = getPlaybackCanvas();
    if (!playbackCanvas) {
      return null;
    }

    const drawingCanvas = getDrawingCanvas();
    const stableLayout = drawingCanvasRef.current?.getPlaybackSurfaceLayout() ?? null;
    const cachedMetrics = playbackSurfaceMetricsRef.current;
    if (
      cachedMetrics &&
      cachedMetrics.canvasWidth === playbackCanvas.width &&
      cachedMetrics.canvasHeight === playbackCanvas.height &&
      cachedMetrics.drawingCanvasWidth === (stableLayout?.drawingCanvasWidth ?? drawingCanvas?.width ?? null) &&
      cachedMetrics.drawingCanvasHeight === (stableLayout?.drawingCanvasHeight ?? drawingCanvas?.height ?? null)
    ) {
      return cachedMetrics;
    }

    const playbackRect = playbackCanvas.getBoundingClientRect();
    const cssWidth = playbackRect.width > 0 ? playbackRect.width : playbackCanvas.width;
    const cssHeight = playbackRect.height > 0 ? playbackRect.height : playbackCanvas.height;
    const stageGuide = getWorkspaceStageGuide();
    const fallbackLayout: DrawingCanvasPlaybackSurfaceLayout = {
      drawingCanvasWidth: drawingCanvas?.width ?? null,
      drawingCanvasHeight: drawingCanvas?.height ?? null,
      worldWidth: cssWidth,
      worldHeight: cssHeight,
      worldDisplayRect: {
        left: 0,
        top: 0,
        width: cssWidth,
        height: cssHeight,
      },
      stageDisplayRect: {
        left: 0,
        top: 0,
        width: cssWidth,
        height: cssHeight,
      },
    };
    const resolvedLayout = stableLayout ?? fallbackLayout;
    const nextMetrics: PlaybackSurfaceMetrics = {
      canvasWidth: playbackCanvas.width,
      canvasHeight: playbackCanvas.height,
      drawingCanvasWidth: resolvedLayout.drawingCanvasWidth,
      drawingCanvasHeight: resolvedLayout.drawingCanvasHeight,
      worldWidth: resolvedLayout.worldWidth,
      worldHeight: resolvedLayout.worldHeight,
      cssWidth,
      cssHeight,
      worldDisplayRect: resolvedLayout.worldDisplayRect,
      stageDisplayRect: resolvedLayout.stageDisplayRect,
      hostBackgroundColor: playbackCanvas.parentElement
        ? window.getComputedStyle(playbackCanvas.parentElement).backgroundColor || WORKSPACE_HOST_BACKGROUND_FALLBACK
        : WORKSPACE_HOST_BACKGROUND_FALLBACK,
      stageBackgroundColor: stageGuide
        ? window.getComputedStyle(stageGuide).backgroundColor || WORKSPACE_STAGE_BACKGROUND_FALLBACK
        : WORKSPACE_STAGE_BACKGROUND_FALLBACK,
    };

    playbackSurfaceMetricsRef.current = nextMetrics;
    return nextMetrics;
  }, [getDrawingCanvas, getPlaybackCanvas, getWorkspaceStageGuide]);

  const renderBitmapsToPlaybackCanvas = useCallback(
    (resolutions: ReadonlyArray<PlaybackBitmapResolution>) => {
      const canvas = getPlaybackCanvas();
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      const metrics = getPlaybackSurfaceMetrics();
      if (!metrics) {
        return;
      }
      const {
        cssWidth,
        cssHeight,
        hostBackgroundColor,
        stageBackgroundColor,
        worldDisplayRect,
        stageDisplayRect,
        drawingCanvasWidth: referenceWidth,
        drawingCanvasHeight: referenceHeight,
        worldWidth,
        worldHeight,
      } = metrics;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();

      ctx.fillStyle = hostBackgroundColor;
      ctx.fillRect(0, 0, cssWidth, cssHeight);
      if (stageDisplayRect) {
        ctx.fillStyle = stageBackgroundColor;
        ctx.fillRect(stageDisplayRect.left, stageDisplayRect.top, stageDisplayRect.width, stageDisplayRect.height);
      }
      ctx.imageSmoothingEnabled = false;

      for (const resolution of resolutions) {
        const bitmap = resolution.bitmap ?? null;
        const sourceCanvas = resolution.drawSource ?? (bitmap ? createBitmapCanvas(bitmap) : null);
        if (!sourceCanvas && resolution.textObjects.length === 0) {
          continue;
        }

        if (!referenceWidth || !referenceHeight || referenceWidth <= 0 || referenceHeight <= 0) {
          if (sourceCanvas) {
            ctx.drawImage(sourceCanvas, 0, 0, cssWidth, cssHeight);
          }
          const textReferenceWidth = Math.max(1, worldWidth);
          const textReferenceHeight = Math.max(1, worldHeight);
          for (const textObject of resolution.textObjects) {
            drawScaledDrawingTextObject(ctx, textObject, {
              offsetX: 0,
              offsetY: 0,
              scaleX: cssWidth / textReferenceWidth,
              scaleY: cssHeight / textReferenceHeight,
            });
          }
          continue;
        }

        const drawWidth = sourceCanvas
          ? worldDisplayRect.width * (sourceCanvas.width / referenceWidth)
          : worldDisplayRect.width;
        const drawHeight = sourceCanvas
          ? worldDisplayRect.height * (sourceCanvas.height / referenceHeight)
          : worldDisplayRect.height;
        const drawLeft = sourceCanvas
          ? worldDisplayRect.left + Math.round((worldDisplayRect.width - drawWidth) / 2)
          : worldDisplayRect.left;
        const drawTop = sourceCanvas
          ? worldDisplayRect.top + Math.round((worldDisplayRect.height - drawHeight) / 2)
          : worldDisplayRect.top;
        if (sourceCanvas) {
          ctx.drawImage(sourceCanvas, drawLeft, drawTop, drawWidth, drawHeight);
        }
        const textScaleX = worldDisplayRect.width / Math.max(1, worldWidth);
        const textScaleY = worldDisplayRect.height / Math.max(1, worldHeight);
        for (const textObject of resolution.textObjects) {
          drawScaledDrawingTextObject(ctx, textObject, {
            offsetX: worldDisplayRect.left,
            offsetY: worldDisplayRect.top,
            scaleX: textScaleX,
            scaleY: textScaleY,
          });
        }
      }
    },
    [getPlaybackCanvas, getPlaybackSurfaceMetrics],
  );

  const renderWorkspaceCanvases = useCallback(
    (
      nextLayers: WorkspaceLayer[],
      frameIndex: number,
      options?: { playback?: boolean; activeLayerId?: string; debugCaller?: string; allowWhilePlaying?: boolean },
    ) => {
      const playback = Boolean(options?.playback);
      const nextActiveLayerId = options?.activeLayerId ?? activeLayerIdRef.current;
      const debugCaller = options?.debugCaller ?? "unknown";
      const allowWhilePlaying = Boolean(options?.allowWhilePlaying);

      if (!playback && isTimelinePlayingRef.current && !allowWhilePlaying) {
        motionTweenWarn("renderWorkspaceCanvases:non-playback-during-playback", {
          caller: debugCaller,
          frameIndex,
          activeLayerId: nextActiveLayerId,
        });
        return;
      }

      if (playback) {
        const playbackLayers = [...nextLayers].reverse();
        const playbackResolutions = playbackLayers.map((layer) => {
          const resolution = resolvePlaybackTimelineBitmap(layer, frameIndex, frozenTweenPlaybackCacheRef.current);
          if (ENABLE_MOTION_TWEEN_DEBUG) {
            motionTweenDebug("renderWorkspaceCanvases:playback-layer", {
              caller: debugCaller,
              frameIndex,
              layerId: layer.id,
              renderSource: resolution.renderSource,
              ...resolution.debugMeta,
            });
          }
          return resolution;
        });
        if (!playbackResolutions.some((resolution) => resolution.bitmap != null || resolution.drawSource != null || resolution.textObjects.length > 0)) {
          const stageClearPayload = {
            caller: debugCaller,
            frameIndex,
            activeLayerId: nextActiveLayerId,
            layerResolutions: playbackResolutions.map((resolution, index) => ({
              layerId: playbackLayers[index]?.id ?? null,
              renderSource: resolution.renderSource,
              debugMeta: resolution.debugMeta ?? null,
            })),
          };
          const hasInvariantFailure = playbackResolutions.some((resolution) =>
            isPlaybackInvariantFailureReason(resolution.debugMeta?.fallbackReason),
          );
          const hasRecoverableInvalidOwner = playbackResolutions.some((resolution) =>
            isRecoverablePlaybackFallbackReason(resolution.debugMeta?.fallbackReason),
          );

          if (hasInvariantFailure) {
            motionTweenError("renderWorkspaceCanvases:playback-cleared-stage", stageClearPayload);
          } else if (hasRecoverableInvalidOwner || playbackResolutions.every((resolution) => resolution.bitmap === null)) {
            motionTweenWarn("renderWorkspaceCanvases:playback-cleared-stage", stageClearPayload);
          }
        }

        renderBitmapsToPlaybackCanvas(playbackResolutions);
        return;
      }

      renderBitmapToPlaybackCanvas(null);

      const activeLayerForRender = getLayerById(nextLayers, nextActiveLayerId) ?? nextLayers[0] ?? null;
      if (!activeLayerForRender) {
        renderBitmapsToTargetCanvas(getBackgroundCanvas(), []);
        renderBitmapsToTargetCanvas(getForegroundCanvas(), []);
        restoreBitmapToCanvas(null);
        return;
      }

      const tweenEditContext = resolveTweenEditContext(activeLayerForRender.timelineFrames, frameIndex, activeLayerForRender.id);
      const activeBitmap = resolveTimelineBitmap(activeLayerForRender.timelineFrames, frameIndex, { tweenEditContext });
      renderBitmapsToTargetCanvas(getBackgroundCanvas(), []);
      renderBitmapsToTargetCanvas(getForegroundCanvas(), []);
      restoreBitmapToCanvas(activeBitmap);
    },
    [
      getBackgroundCanvas,
      getForegroundCanvas,
      renderBitmapsToPlaybackCanvas,
      renderBitmapsToTargetCanvas,
      renderBitmapToPlaybackCanvas,
      restoreBitmapToCanvas,
    ],
  );

  const restorePrePlaybackEditState = useCallback(() => {
    const returnState = playbackReturnStateRef.current;
    invalidatePlaybackSurfaceMetrics();
    renderBitmapToPlaybackCanvas(null);

    if (!returnState) {
      return false;
    }

    const restoredLayer = getLayerById(layersRef.current, returnState.activeLayerId) ?? layersRef.current[0] ?? null;
    if (!restoredLayer) {
      playbackReturnStateRef.current = null;
      return false;
    }

    activeLayerIdRef.current = restoredLayer.id;
    timelineFramesRef.current = restoredLayer.timelineFrames;
    currentFrameIndexRef.current = returnState.currentFrameIndex;
    selectedTimelineIndexRef.current = returnState.selectedTimelineIndex;

    setActiveLayerId(restoredLayer.id);
    setCurrentFrameIndex(returnState.currentFrameIndex);
    setSelectedTimelineIndex(returnState.selectedTimelineIndex);

    playbackReturnStateRef.current = null;
    return true;
  }, [invalidatePlaybackSurfaceMetrics, renderBitmapToPlaybackCanvas]);

  const stopTimelinePlaybackAudio = useCallback(() => {
    for (const source of timelinePlaybackSourceRef.current) {
      try {
        source.stop();
      } catch {
        // Ignore already-ended playback sources.
      }
    }

    timelinePlaybackSourceRef.current = [];

    for (const audio of timelinePlaybackAudioRef.current) {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {
        // Ignore cleanup issues from detached audio elements.
      }
    }

    timelinePlaybackAudioRef.current = [];
  }, []);

  const ensureTimelinePlaybackAudioContext = useCallback(async () => {
    if (typeof window === "undefined") {
      return null;
    }

    const AudioContextClass = (window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) ?? null;
    if (!AudioContextClass) {
      return null;
    }

    let context = timelinePlaybackAudioContextRef.current;
    if (!context || context.state === "closed") {
      context = new AudioContextClass();
      timelinePlaybackAudioContextRef.current = context;
    }

    if (context.state === "suspended") {
      try {
        await context.resume();
      } catch {
        // Ignore resume failures and fall back to HTMLAudioElement playback.
      }
    }

    return context;
  }, []);

  const preloadTimelineSoundAttachment = useCallback(
    async (soundAttachment: WorkspaceSoundAttachment | null) => {
      if (!soundAttachment?.audioDataUrl) {
        return;
      }

      const cacheKey = `${soundAttachment.id}:${soundAttachment.audioDataUrl}`;
      if (timelinePlaybackAudioBufferRef.current.has(cacheKey)) {
        return;
      }

      const context = await ensureTimelinePlaybackAudioContext();
      if (!context) {
        return;
      }

      try {
        const response = await fetch(soundAttachment.audioDataUrl);
        const encodedBuffer = await response.arrayBuffer();
        const decodedBuffer = await context.decodeAudioData(encodedBuffer.slice(0));
        timelinePlaybackAudioBufferRef.current.set(cacheKey, decodedBuffer);
      } catch (error) {
        console.warn("Failed to preload attached timeline sound.", error);
      }
    },
    [ensureTimelinePlaybackAudioContext],
  );

  const playAttachedSoundsForFrameIndices = useCallback(
    (frameIndices: number[]) => {
      if (typeof Audio === "undefined" || frameIndices.length === 0) {
        return;
      }

      const uniqueFrameIndices = [...new Set(frameIndices.filter((index) => index >= 0))];
      if (uniqueFrameIndices.length === 0) {
        return;
      }

      for (const frameIndex of uniqueFrameIndices) {
        for (const layer of layersRef.current) {
          const soundAttachment = layer.timelineFrames[frameIndex]?.soundAttachment ?? null;
          if (!soundAttachment?.audioDataUrl) {
            continue;
          }

          const cacheKey = `${soundAttachment.id}:${soundAttachment.audioDataUrl}`;
          const cachedBuffer = timelinePlaybackAudioBufferRef.current.get(cacheKey) ?? null;
          const audioContext = timelinePlaybackAudioContextRef.current;
          if (audioContext && cachedBuffer) {
            try {
              const source = audioContext.createBufferSource();
              source.buffer = cachedBuffer;
              source.connect(audioContext.destination);
              source.onended = () => {
                timelinePlaybackSourceRef.current = timelinePlaybackSourceRef.current.filter((currentSource) => currentSource !== source);
              };
              timelinePlaybackSourceRef.current.push(source);
              source.start(0);
              continue;
            } catch (error) {
              console.warn("Failed to play cached attached timeline sound.", error);
            }
          }

          let templateAudio = timelinePlaybackAudioTemplateRef.current.get(cacheKey) ?? null;
          if (!templateAudio) {
            templateAudio = new Audio(soundAttachment.audioDataUrl);
            templateAudio.preload = "auto";
            templateAudio.load();
            timelinePlaybackAudioTemplateRef.current.set(cacheKey, templateAudio);
          }

          void preloadTimelineSoundAttachment(soundAttachment);

          const audio = templateAudio.cloneNode(true) as HTMLAudioElement;
          audio.preload = "auto";
          audio.currentTime = 0;
          const removeAudio = () => {
            timelinePlaybackAudioRef.current = timelinePlaybackAudioRef.current.filter((currentAudio) => currentAudio !== audio);
          };

          audio.addEventListener("ended", removeAudio, { once: true });
          audio.addEventListener("error", removeAudio, { once: true });
          timelinePlaybackAudioRef.current.push(audio);
          void audio.play().catch((error) => {
            console.warn("Failed to play attached timeline sound.", error);
            removeAudio();
          });
        }
      }
    },
    [preloadTimelineSoundAttachment],
  );

  const restoreWorkspaceHistoryEntry = useCallback(
    (entry: DrawingWorkspaceHistoryEntry, debugCaller: "undo" | "redo") => {
      const sourceLayers = entry.layers.length > 0 ? entry.layers : createDefaultWorkspaceLayers();
      const preserveCurrentNavigation = workspaceLayersStructureEqual(layersRef.current, sourceLayers);
      const nextLayers = normalizeLayerOrder(cloneWorkspaceLayers(sourceLayers));
      const preferredActiveLayerId = preserveCurrentNavigation ? activeLayerIdRef.current : entry.activeLayerId;
      const nextActiveLayer =
        getLayerById(nextLayers, preferredActiveLayerId) ??
        getLayerById(nextLayers, entry.activeLayerId) ??
        nextLayers[0] ??
        null;
      if (!nextActiveLayer) {
        return;
      }

      const maxTimelineIndex = Math.max(0, getGlobalTimelineFrameCount(nextLayers) - 1);
      const preferredCurrentFrameIndex = preserveCurrentNavigation ? currentFrameIndexRef.current : entry.currentFrameIndex;
      const preferredSelectedTimelineIndex = preserveCurrentNavigation
        ? selectedTimelineIndexRef.current
        : entry.selectedTimelineIndex;
      const nextCurrentFrameIndex = Math.max(0, Math.min(preferredCurrentFrameIndex, maxTimelineIndex));
      const nextSelectedTimelineIndex = Math.max(0, Math.min(preferredSelectedTimelineIndex, maxTimelineIndex));

      resizeCommitSessionRef.current = null;
      frozenTweenPlaybackCacheRef.current = new Map();
      clearLocalDrawingHistory();
      suppressNextWorkspaceAutosaveRef.current = true;
      drawingCanvasRef.current?.clearTransientEditingState();
      isTimelinePlayingRef.current = false;
      stopTimelinePlaybackAudio();

      layersRef.current = nextLayers;
      activeLayerIdRef.current = nextActiveLayer.id;
      timelineFramesRef.current = nextActiveLayer.timelineFrames;
      currentFrameIndexRef.current = nextCurrentFrameIndex;
      selectedTimelineIndexRef.current = nextSelectedTimelineIndex;
      nextTimelineFrameIdRef.current = Math.max(entry.nextTimelineFrameId, getMaxTimelineFrameId(nextLayers) + 1);
      nextLayerNumberRef.current = Math.max(entry.nextLayerNumber, getNextLayerNumber(nextLayers));

      setLayers(nextLayers);
      setActiveLayerId(nextActiveLayer.id);
      setCurrentFrameIndex(nextCurrentFrameIndex);
      setSelectedTimelineIndex(nextSelectedTimelineIndex);
      setIsTimelinePlaying(false);

      renderWorkspaceCanvases(nextLayers, nextCurrentFrameIndex, {
        activeLayerId: nextActiveLayer.id,
        debugCaller: `history:${debugCaller}`,
      });
      updateHistoryWorkspaceStamp();
      syncHistoryAvailability();

      window.requestAnimationFrame(() => {
        suppressNextWorkspaceAutosaveRef.current = false;
      });
    },
    [clearLocalDrawingHistory, renderWorkspaceCanvases, stopTimelinePlaybackAudio, syncHistoryAvailability, updateHistoryWorkspaceStamp],
  );

  const replaceLayerFrames = useCallback((
    layerId: string,
    nextFrames: WorkspaceTimelineFrame[],
    options?: { preserveTimelineRowView?: boolean },
  ) => {
    const currentLayers = layersRef.current;
    const targetLayerIndex = currentLayers.findIndex((layer) => layer.id === layerId);
    if (targetLayerIndex < 0) {
      return currentLayers;
    }

    const currentLayer = currentLayers[targetLayerIndex];
    if (currentLayer.timelineFrames === nextFrames) {
      return currentLayers;
    }

    const nextLayers = currentLayers.slice();
    nextLayers[targetLayerIndex] = {
      ...currentLayer,
      timelineFrames: nextFrames,
    };
    if (options?.preserveTimelineRowView) {
      timelineRowLayersSourceRef.current = nextLayers;
    }
    layersRef.current = nextLayers;
    const resolvedActiveLayer = getLayerById(nextLayers, activeLayerIdRef.current) ?? nextLayers[0] ?? null;
    timelineFramesRef.current = resolvedActiveLayer?.timelineFrames ?? [];
    startTransition(() => {
      setLayers(nextLayers);
    });
    return nextLayers;
  }, []);

  const setLocalDrawingHistoryBaselines = useCallback((contextKeys: string[]) => {
    const nextKeys = Array.from(new Set(contextKeys.filter((contextKey) => contextKey.length > 0)));
    if (nextKeys.length === 0) {
      return;
    }

    for (const contextKey of nextKeys) {
      localDrawingHistoryRef.current.set(contextKey, {
        entries: [],
        position: -1,
        blocksGlobalTraversal: true,
      });
    }
    syncHistoryAvailability();
  }, [syncHistoryAvailability]);

  const pushLocalDrawingHistoryEntry = useCallback((
    entry: LocalDrawingHistoryEntry,
    options?: { resetStack?: boolean },
  ) => {
    const existingStack = options?.resetStack
      ? {
          entries: [],
          position: -1,
          blocksGlobalTraversal: false,
        }
      : localDrawingHistoryRef.current.get(entry.contextKey) ?? {
          entries: [],
          position: -1,
          blocksGlobalTraversal: false,
        };
    const nextEntries = existingStack.entries.slice(0, existingStack.position + 1);
    nextEntries.push(entry);
    localDrawingHistoryRef.current.set(entry.contextKey, {
      entries: nextEntries,
      position: nextEntries.length - 1,
      blocksGlobalTraversal: existingStack.blocksGlobalTraversal,
    });
    syncHistoryAvailability();
  }, [syncHistoryAvailability]);

  const ensureDetachedLocalHistoryBitmap = useCallback((
    context: LocalDrawingHistoryContext | null,
    currentBitmap: ImageData | null,
  ) => {
    if (!context || !currentBitmap) {
      return false;
    }

    const currentHistoryIndex = currentHistoryIndexRef.current;
    if (currentHistoryIndex < 0) {
      return false;
    }

    const currentHistoryEntry = historyEntriesRef.current[currentHistoryIndex] ?? null;
    if (!currentHistoryEntry) {
      return false;
    }

    const historyLayerIndex = currentHistoryEntry.layers.findIndex((layer) => layer.id === context.layerId);
    if (historyLayerIndex < 0) {
      return false;
    }
    const historyLayer = currentHistoryEntry.layers[historyLayerIndex] ?? null;
    if (!historyLayer) {
      return false;
    }

    const historyFrameIndex = findTimelineFrameIndexById(historyLayer.timelineFrames, context.targetFrameId);
    if (historyFrameIndex < 0) {
      return false;
    }

    const historyFrame = historyLayer.timelineFrames[historyFrameIndex] ?? null;
    if (!historyFrame) {
      return false;
    }

    const historyBitmap = resolveWorkspaceTimelineFrameTargetBitmap(historyFrame, context.target);
    if (historyBitmap !== currentBitmap) {
      return true;
    }

    const nextHistoryLayers = currentHistoryEntry.layers.slice();
    const nextHistoryFrames = historyLayer.timelineFrames.slice();
    nextHistoryFrames[historyFrameIndex] = {
      ...historyFrame,
      bitmap: context.target === "bitmap" ? cloneBitmap(historyFrame.bitmap) : historyFrame.bitmap,
      tweenEndBitmap:
        context.target === "tweenEndBitmap" ? cloneBitmap(historyFrame.tweenEndBitmap) : historyFrame.tweenEndBitmap,
    };
    nextHistoryLayers[historyLayerIndex] = {
      ...historyLayer,
      timelineFrames: nextHistoryFrames,
    };
    historyEntriesRef.current = historyEntriesRef.current.map((entry, historyIndex) =>
      historyIndex === currentHistoryIndex
        ? {
            ...entry,
            layers: nextHistoryLayers,
          }
        : entry,
    );
    historyWorkspaceStampRef.current = null;
    return true;
  }, []);

  const applyLocalDrawingHistoryEntry = useCallback(
    (entry: LocalDrawingHistoryEntry, direction: "undo" | "redo") => {
      if (entry.kind === "timeline-snapshot") {
        const nextFrames = cloneWorkspaceTimelineFrames(direction === "undo" ? entry.beforeFrames : entry.afterFrames);
        const nextLayers = replaceLayerFrames(entry.layerId, nextFrames);
        const maxTimelineIndex = Math.max(0, nextFrames.length - 1);
        const nextCurrentFrameIndex = Math.max(0, Math.min(currentFrameIndexRef.current, maxTimelineIndex));
        const nextSelectedTimelineIndex = Math.max(0, Math.min(selectedTimelineIndexRef.current, maxTimelineIndex));
        if (entry.layerId === activeLayerIdRef.current) {
          timelineFramesRef.current = nextFrames;
          if (nextCurrentFrameIndex !== currentFrameIndexRef.current) {
            currentFrameIndexRef.current = nextCurrentFrameIndex;
            setCurrentFrameIndex(nextCurrentFrameIndex);
          }
          if (nextSelectedTimelineIndex !== selectedTimelineIndexRef.current) {
            selectedTimelineIndexRef.current = nextSelectedTimelineIndex;
            setSelectedTimelineIndex(nextSelectedTimelineIndex);
          }
        }
        drawingCanvasRef.current?.clearTransientEditingState();
        renderWorkspaceCanvases(nextLayers, nextCurrentFrameIndex, {
          activeLayerId: activeLayerIdRef.current,
          debugCaller: `local-drawing-history:${direction}`,
        });
        return true;
      }

      const targetLayer = getLayerById(layersRef.current, entry.layerId) ?? null;
      if (!targetLayer) {
        return false;
      }

      const targetFrameIndex = findTimelineFrameIndexById(targetLayer.timelineFrames, entry.targetFrameId);
      if (targetFrameIndex < 0) {
        return false;
      }

      const currentFrame = targetLayer.timelineFrames[targetFrameIndex] ?? null;
      if (!currentFrame) {
        return false;
      }

      const nextFrames = targetLayer.timelineFrames.slice();
      const nextBitmap =
        entry.kind === "patch"
          ? materializeBitmapPatch({
              currentBitmap: entry.target === "bitmap" ? currentFrame.bitmap : currentFrame.tweenEndBitmap,
              patchBitmap: direction === "undo" ? entry.beforePatchBitmap : entry.afterPatchBitmap,
              patchRect: entry.patchRect,
              bitmapWidth: entry.bitmapWidth,
              bitmapHeight: entry.bitmapHeight,
            })
          : entry.kind === "metadata"
            ? resolveWorkspaceTimelineFrameTargetBitmap(currentFrame, entry.target)
            : cloneBitmap(direction === "undo" ? entry.beforeBitmap : entry.afterBitmap);
      const nextFrame = applyWorkspaceTimelineFrameMetadata(
        currentFrame,
        direction === "undo" ? entry.beforeFrameMeta : entry.afterFrameMeta,
        entry.target,
        nextBitmap,
      );
      nextFrames[targetFrameIndex] = nextFrame;

      const nextLayers = replaceLayerFrames(entry.layerId, nextFrames);
      if (entry.layerId === activeLayerIdRef.current) {
        timelineFramesRef.current = nextFrames;
      }
      drawingCanvasRef.current?.clearTransientEditingState();
      renderWorkspaceCanvases(nextLayers, currentFrameIndexRef.current, {
        activeLayerId: activeLayerIdRef.current,
        debugCaller: `local-drawing-history:${direction}`,
      });
      return true;
    },
    [renderWorkspaceCanvases, replaceLayerFrames],
  );

  const applyLocalDrawingHistoryTraversal = useCallback(
    (direction: "undo" | "redo") => {
      const context = resolveLocalDrawingHistoryContext();
      if (!context) {
        return false;
      }

      const stack = localDrawingHistoryRef.current.get(context.key) ?? null;
      if (!stack) {
        return false;
      }

      const targetPosition = direction === "undo" ? stack.position : stack.position + 1;
      const entry = stack.entries[targetPosition] ?? null;
      if (!entry) {
        return false;
      }

      const didApply = applyLocalDrawingHistoryEntry(entry, direction);
      if (!didApply) {
        localDrawingHistoryRef.current.delete(context.key);
        syncHistoryAvailability();
        return false;
      }

      localDrawingHistoryRef.current.set(context.key, {
        ...stack,
        position: direction === "undo" ? stack.position - 1 : stack.position + 1,
      });
      updateHistoryWorkspaceStamp("local-drawing");
      syncHistoryAvailability();
      return true;
    },
    [applyLocalDrawingHistoryEntry, resolveLocalDrawingHistoryContext, syncHistoryAvailability, updateHistoryWorkspaceStamp],
  );

  const ensureTimelineLength = useCallback((frames: WorkspaceTimelineFrame[], targetIndex: number) => {
    const nextFrames = frames.slice();

    while (nextFrames.length <= targetIndex) {
      nextFrames.push(createEmptyTimelineFrame(nextTimelineFrameIdRef.current));
      nextTimelineFrameIdRef.current += 1;
    }

    return nextFrames;
  }, []);

  const resolveInsertionSourceSnapshot = useCallback(
    (
      layerId: string,
      frames: WorkspaceTimelineFrame[],
      targetIndex: number,
      liveSnapshot: TimelineFrameSnapshot | null,
    ) => {
      const normalizedTargetIndex = Math.max(0, targetIndex);
      const currentIndex = currentFrameIndexRef.current;
      const currentFrame = frames[currentIndex] ?? null;
      const fallbackEndIndex = Math.min(normalizedTargetIndex, frames.length) - 1;
      const targetSnapshot = resolveLayerLocalCopySourceSnapshot(frames, normalizedTargetIndex, layerId);
      const sourceIndex = targetSnapshot
        ? normalizedTargetIndex
        : findPreviousFilledIndex(frames, fallbackEndIndex, {
            layerId,
            requireCopyableBitmap: true,
          });

      if (sourceIndex >= 0) {
        const sourceFrame = frames[sourceIndex] ?? null;
        if (
          liveSnapshot &&
          liveSnapshot.bitmap &&
          layerId === activeLayerIdRef.current &&
          currentFrame &&
          !isEmptyTimelineSlot(currentFrame) &&
          sourceFrame &&
          currentFrame.stateId === sourceFrame.stateId
        ) {
          return adoptSnapshot(liveSnapshot, { isolateBitmap: true });
        }

        const sourceSnapshot = resolveLayerLocalCopySourceSnapshot(frames, sourceIndex, layerId);
        return sourceSnapshot ? adoptSnapshot(sourceSnapshot, { isolateBitmap: true }) : { bitmap: null, previewUrl: null };
      }

      if (
        liveSnapshot &&
        liveSnapshot.bitmap &&
        layerId === activeLayerIdRef.current &&
        currentFrame &&
        !isEmptyTimelineSlot(currentFrame)
      ) {
        return adoptSnapshot(liveSnapshot, { isolateBitmap: true });
      }

      return { bitmap: null, previewUrl: null };
    },
    [],
  );

  const resolvePersistedInsertionSourceSnapshot = useCallback(
    (layerId: string, frames: WorkspaceTimelineFrame[], targetIndex: number): TimelineFrameSnapshot => {
      const normalizedTargetIndex = Math.max(0, targetIndex);
      const fallbackEndIndex = Math.min(normalizedTargetIndex, frames.length) - 1;
      const targetSnapshot = resolveLayerLocalCopySourceSnapshot(frames, normalizedTargetIndex, layerId);
      const sourceIndex = targetSnapshot
        ? normalizedTargetIndex
        : findPreviousFilledIndex(frames, fallbackEndIndex, {
            layerId,
            requireCopyableBitmap: true,
          });

      if (sourceIndex < 0) {
        return { bitmap: null, previewUrl: null };
      }

      const sourceSnapshot = resolveLayerLocalCopySourceSnapshot(frames, sourceIndex, layerId);
      return sourceSnapshot ? adoptSnapshot(sourceSnapshot, { isolateBitmap: true }) : { bitmap: null, previewUrl: null };
    },
    [],
  );

  const resolveInsertionSourceTextObjects = useCallback((
    layerId: string,
    frames: WorkspaceTimelineFrame[],
    targetIndex: number,
  ) => {
    const normalizedTargetIndex = Math.max(0, targetIndex);
    const fallbackEndIndex = Math.min(normalizedTargetIndex, frames.length) - 1;
    const targetSourceObjects = resolveLayerLocalCopySourceTextObjects(frames, normalizedTargetIndex);
    if (targetSourceObjects.length > 0) {
      return targetSourceObjects;
    }

    const sourceIndex = findPreviousFilledIndex(frames, fallbackEndIndex, {
      layerId,
      requireCopyableBitmap: true,
    });
    if (sourceIndex < 0) {
      return EMPTY_DRAWING_TEXT_OBJECTS;
    }

    return resolveLayerLocalCopySourceTextObjects(frames, sourceIndex);
  }, []);

  const applyTimelineFrameInsertion = useCallback(
    (
      frames: WorkspaceTimelineFrame[],
      kind: TimelineFrameKind,
      targetIndex: number,
      sourceSnapshot: TimelineFrameSnapshot,
      options?: { blank?: boolean; nextTimelineFrameId: number; sourceTextObjects?: DrawingTextObject[] },
    ) => {
      const nextFrames = frames.slice();
      const targetSlotIndex = Math.max(0, targetIndex);
      const nextTimelineFrameIdCursor = { current: options?.nextTimelineFrameId ?? 1 } as MutableRefObject<number>;
      const previousLength = nextFrames.length;

      while (nextFrames.length <= targetSlotIndex) {
        nextFrames.push(createEmptyTimelineFrame(nextTimelineFrameIdCursor.current));
        nextTimelineFrameIdCursor.current += 1;
      }

      const targetFrame = nextFrames[targetSlotIndex];
      if (!targetFrame) {
        return {
          frames: nextFrames,
          nextIndex: targetSlotIndex,
          nextTimelineFrameId: nextTimelineFrameIdCursor.current,
          insertedCount: 0,
          shiftBoundary: previousLength,
        };
      }

      let nextIndex = targetSlotIndex;
      let shiftBoundary = previousLength;

      if (targetFrame.cellType === "empty") {
        if (kind === "keyframe") {
          nextFrames[targetSlotIndex] = createTimelineFrame(
            targetFrame.id,
            "keyframe",
            options?.blank ? "blank-keyframe" : "keyframe",
            targetFrame.id,
            sourceSnapshot,
          );
          nextFrames[targetSlotIndex] = {
            ...nextFrames[targetSlotIndex],
            textObjects: options?.blank ? [] : cloneWorkspaceTextObjects(options?.sourceTextObjects ?? []),
          };
        } else {
          const sourceIndex = findPreviousFilledIndex(nextFrames, targetSlotIndex - 1);

          if (sourceIndex < 0) {
            nextFrames[targetSlotIndex] =
              kind === "tween"
                ? createTimelineFrame(targetFrame.id, "tween", "tween", targetFrame.id, sourceSnapshot)
                : createTimelineFrame(targetFrame.id, "keyframe", "keyframe", targetFrame.id, sourceSnapshot);
            nextFrames[targetSlotIndex] = {
              ...nextFrames[targetSlotIndex],
              textObjects: cloneWorkspaceTextObjects(options?.sourceTextObjects ?? []),
            };
          } else {
            const sourceFrame = nextFrames[sourceIndex];
            const spanType = kind === "tween" || sourceFrame.cellType === "tween" ? "tween" : "frame";
            const sourceEndIndex = getFrameDurationEndIndex(nextFrames, sourceIndex);
            const nextFilledIndex = findNextFilledIndex(nextFrames, targetSlotIndex + 1);

            fillTimelineRangeWithSpan(
              nextFrames,
              sourceEndIndex + 1,
              targetSlotIndex,
              sourceFrame.stateId,
              spanType,
              nextTimelineFrameIdCursor,
            );

            if (nextFilledIndex >= 0) {
              fillTimelineRangeWithSpan(
                nextFrames,
                targetSlotIndex + 1,
                targetSlotIndex + 1,
                sourceFrame.stateId,
                spanType,
                nextTimelineFrameIdCursor,
              );
              shiftBoundary = targetSlotIndex + 1;
            } else {
              shiftBoundary = previousLength;
            }

            nextIndex = targetSlotIndex;
          }
        }
      } else {
        let insertIndex = targetSlotIndex + 1;

        if (kind === "frame") {
          insertIndex = getFrameDurationEndIndex(nextFrames, targetSlotIndex) + 1;
          if (insertIndex < previousLength) {
            const frameAtInsertIndex = nextFrames[insertIndex];
            if (frameAtInsertIndex && frameAtInsertIndex.cellType !== "empty") {
              shiftBoundary = insertIndex;
            }
          }
          fillTimelineRangeWithSpan(
            nextFrames,
            insertIndex,
            insertIndex,
            targetFrame.stateId,
            targetFrame.cellType === "tween" ? "tween" : "frame",
            nextTimelineFrameIdCursor,
          );
          nextIndex = insertIndex;
        } else if (kind === "keyframe") {
          const nextFrameId = nextTimelineFrameIdCursor.current;
          nextTimelineFrameIdCursor.current += 1;
          const nextFrame = createTimelineFrame(
            nextFrameId,
            "keyframe",
            options?.blank ? "blank-keyframe" : "keyframe",
            nextFrameId,
            sourceSnapshot,
          );
          nextFrames.splice(insertIndex, 0, {
            ...nextFrame,
            textObjects: options?.blank ? [] : cloneWorkspaceTextObjects(options?.sourceTextObjects ?? []),
          });
          reassignTrailingStateCells(nextFrames, insertIndex, targetFrame.stateId, nextFrame.stateId);
          nextIndex = insertIndex;
          if (insertIndex < previousLength) {
            shiftBoundary = insertIndex;
          }
        } else {
          if (targetFrame.cellType === "tween") {
            insertIndex = getFrameDurationEndIndex(nextFrames, targetSlotIndex) + 1;
          }

          const nextFrameId = nextTimelineFrameIdCursor.current;
          nextTimelineFrameIdCursor.current += 1;
          const nextFrame = createTimelineFrame(nextFrameId, "tween", "tween", targetFrame.stateId);
          nextFrames.splice(insertIndex, 0, nextFrame);

          if (targetFrame.cellType !== "tween") {
            convertTrailingStateCellsToTween(nextFrames, insertIndex, targetFrame.stateId);
          }

          nextIndex = insertIndex;
          if (insertIndex < previousLength) {
            shiftBoundary = insertIndex;
          }
        }
      }

      const insertedCount = Math.max(0, nextFrames.length - previousLength);
      return {
        frames: nextFrames,
        nextIndex,
        nextTimelineFrameId: nextTimelineFrameIdCursor.current,
        insertedCount,
        shiftBoundary: insertedCount > 0 ? shiftBoundary : previousLength,
      };
    },
    [],
  );

  const rebaseHistoryAfterFrameInsertion = useCallback(
    (
      layerId: string,
      kind: TimelineFrameKind,
      targetIndex: number,
      options?: {
        blank?: boolean;
        nextActiveLayerId?: string;
        nextCurrentFrameIndex?: number;
        nextSelectedTimelineIndex?: number;
        nextTimelineFrameId?: number;
      },
    ) => {
      if (historyEntriesRef.current.length === 0 || currentHistoryIndexRef.current < 0) {
        return;
      }

      trimGlobalHistoryEntriesToLimit();
      clearLocalDrawingHistory();

      historyEntriesRef.current = historyEntriesRef.current.map((entry, historyIndex) => {
        const targetLayer = getLayerById(entry.layers, layerId) ?? null;
        if (!targetLayer) {
          return entry;
        }

        const sourceSnapshot = options?.blank
          ? { bitmap: null, previewUrl: null }
          : resolvePersistedInsertionSourceSnapshot(layerId, targetLayer.timelineFrames, targetIndex);
        const sourceTextObjects = options?.blank
          ? EMPTY_DRAWING_TEXT_OBJECTS
          : resolveInsertionSourceTextObjects(layerId, targetLayer.timelineFrames, targetIndex);
        const insertionResult = applyTimelineFrameInsertion(
          targetLayer.timelineFrames,
          kind,
          targetIndex,
          sourceSnapshot,
          {
            blank: options?.blank,
            nextTimelineFrameId: entry.nextTimelineFrameId,
            sourceTextObjects,
          },
        );

        const rebasedLayers = entry.layers.map((layer) =>
          layer.id === layerId
            ? {
                ...layer,
                timelineFrames: insertionResult.frames,
              }
            : layer,
        );

        const rebaseTimelineIndex = (index: number) =>
          insertionResult.insertedCount > 0 && index >= insertionResult.shiftBoundary
            ? index + insertionResult.insertedCount
            : index;
        const isCurrentEntry = historyIndex === currentHistoryIndexRef.current;

        return {
          ...entry,
          layers: rebasedLayers,
          activeLayerId: isCurrentEntry ? (options?.nextActiveLayerId ?? entry.activeLayerId) : entry.activeLayerId,
          currentFrameIndex: isCurrentEntry
            ? (options?.nextCurrentFrameIndex ?? rebaseTimelineIndex(entry.currentFrameIndex))
            : rebaseTimelineIndex(entry.currentFrameIndex),
          selectedTimelineIndex: isCurrentEntry
            ? (options?.nextSelectedTimelineIndex ?? rebaseTimelineIndex(entry.selectedTimelineIndex))
            : rebaseTimelineIndex(entry.selectedTimelineIndex),
          nextTimelineFrameId: isCurrentEntry
            ? (options?.nextTimelineFrameId ?? insertionResult.nextTimelineFrameId)
            : insertionResult.nextTimelineFrameId,
        };
      });

      syncHistoryAvailability();
    },
    [
      applyTimelineFrameInsertion,
      clearLocalDrawingHistory,
      resolveInsertionSourceTextObjects,
      resolvePersistedInsertionSourceSnapshot,
      syncHistoryAvailability,
      trimGlobalHistoryEntriesToLimit,
    ],
  );

  const applyTimelineFrameRemoval = useCallback(
    (
      frames: WorkspaceTimelineFrame[],
      targetIndex: number,
      options?: { nextTimelineFrameId: number },
    ) => {
      if (!frames.length) {
        return null;
      }

      const clampedTarget = Math.max(0, Math.min(targetIndex, frames.length - 1));
      const targetFrame = frames[clampedTarget] ?? null;
      if (!targetFrame || targetFrame.cellType === "empty") {
        return null;
      }

      const nextTimelineFrameIdCursor = { current: options?.nextTimelineFrameId ?? 1 } as MutableRefObject<number>;
      const nextFrames = frames.slice();
      let removeStartIndex = clampedTarget;
      let removeEndIndex = clampedTarget;

      const tweenSpan = resolveTweenSpan(nextFrames, clampedTarget);

      if (tweenSpan) {
        removeStartIndex = tweenSpan.ownerIndex;
        removeEndIndex = tweenSpan.spanEndIndex;
      } else if (isFrameStateStart(targetFrame)) {
        removeEndIndex = getStateSpanEndIndex(nextFrames, clampedTarget);
      } else if (targetFrame.cellType === "hold") {
        removeStartIndex = resolveStateStartIndex(nextFrames, clampedTarget);
        removeEndIndex = getFrameDurationEndIndex(nextFrames, removeStartIndex);
      }

      const collapsedRange = collapseTimelineRange(
        nextFrames,
        removeStartIndex,
        removeEndIndex,
        () => createEmptyTimelineFrame(nextTimelineFrameIdCursor.current++),
      );
      const { frames: collapsedFrames, removedFrameCount } = collapsedRange;
      cleanupTweenEndpointForState(collapsedFrames, targetFrame.stateId);

      return {
        frames: collapsedFrames,
        removedFrameCount,
        removeStartIndex,
        removeEndIndex,
        nextTimelineFrameId: nextTimelineFrameIdCursor.current,
      };
    },
    [],
  );

  const rebaseHistoryAfterFrameRemoval = useCallback(
    (
      layerId: string,
      targetIndex: number,
      options?: {
        nextActiveLayerId?: string;
        nextCurrentFrameIndex?: number;
        nextSelectedTimelineIndex?: number;
        nextTimelineFrameId?: number;
      },
    ) => {
      if (historyEntriesRef.current.length === 0 || currentHistoryIndexRef.current < 0) {
        return;
      }

      trimGlobalHistoryEntriesToLimit();
      clearLocalDrawingHistory();

      historyEntriesRef.current = historyEntriesRef.current.map((entry, historyIndex) => {
        const targetLayer = getLayerById(entry.layers, layerId) ?? null;
        if (!targetLayer) {
          return entry;
        }

        const removalResult = applyTimelineFrameRemoval(targetLayer.timelineFrames, targetIndex, {
          nextTimelineFrameId: entry.nextTimelineFrameId,
        });
        if (!removalResult) {
          return entry;
        }

        const rebasedLayers = entry.layers.map((layer) =>
          layer.id === layerId
            ? {
                ...layer,
                timelineFrames: removalResult.frames,
              }
            : layer,
        );
        const rebaseTimelineIndex = (index: number) => {
          const nextIndex =
            index >= removalResult.removeStartIndex && index <= removalResult.removeEndIndex
              ? removalResult.removeStartIndex
              : index > removalResult.removeEndIndex
                ? index - removalResult.removedFrameCount
                : index;
          return Math.max(0, Math.min(nextIndex, removalResult.frames.length - 1));
        };
        const isCurrentEntry = historyIndex === currentHistoryIndexRef.current;

        return {
          ...entry,
          layers: rebasedLayers,
          activeLayerId: isCurrentEntry ? (options?.nextActiveLayerId ?? entry.activeLayerId) : entry.activeLayerId,
          currentFrameIndex: isCurrentEntry
            ? (options?.nextCurrentFrameIndex ?? rebaseTimelineIndex(entry.currentFrameIndex))
            : rebaseTimelineIndex(entry.currentFrameIndex),
          selectedTimelineIndex: isCurrentEntry
            ? (options?.nextSelectedTimelineIndex ?? rebaseTimelineIndex(entry.selectedTimelineIndex))
            : rebaseTimelineIndex(entry.selectedTimelineIndex),
          nextTimelineFrameId: isCurrentEntry
            ? (options?.nextTimelineFrameId ?? removalResult.nextTimelineFrameId)
            : removalResult.nextTimelineFrameId,
        };
      });

      syncHistoryAvailability();
    },
    [applyTimelineFrameRemoval, clearLocalDrawingHistory, syncHistoryAvailability, trimGlobalHistoryEntriesToLimit],
  );

  const rebaseHistoryAfterLayerDeletion = useCallback(
    (
      deletedLayerId: string,
      deletedLayerIndex: number,
      options?: {
        nextActiveLayerId?: string;
        nextCurrentFrameIndex?: number;
        nextSelectedTimelineIndex?: number;
      },
    ) => {
      if (historyEntriesRef.current.length === 0 || currentHistoryIndexRef.current < 0) {
        return;
      }

      trimGlobalHistoryEntriesToLimit();
      clearLocalDrawingHistory();

      historyEntriesRef.current = historyEntriesRef.current.map((entry, historyIndex) => {
        const targetLayer = getLayerById(entry.layers, deletedLayerId) ?? null;
        if (!targetLayer) {
          return entry;
        }

        const filteredLayers = normalizeLayerOrder(entry.layers.filter((layer) => layer.id !== deletedLayerId));
        const fallbackActiveLayer = filteredLayers[Math.min(deletedLayerIndex, filteredLayers.length - 1)] ?? filteredLayers[0] ?? null;
        if (!fallbackActiveLayer) {
          return entry;
        }

        const isCurrentEntry = historyIndex === currentHistoryIndexRef.current;
        const nextActiveLayerIdForEntry =
          isCurrentEntry
            ? (options?.nextActiveLayerId ?? fallbackActiveLayer.id)
            : entry.activeLayerId === deletedLayerId
              ? fallbackActiveLayer.id
              : entry.activeLayerId;

        return {
          ...entry,
          layers: filteredLayers,
          activeLayerId: nextActiveLayerIdForEntry,
          currentFrameIndex: isCurrentEntry
            ? (options?.nextCurrentFrameIndex ?? entry.currentFrameIndex)
            : entry.currentFrameIndex,
          selectedTimelineIndex: isCurrentEntry
            ? (options?.nextSelectedTimelineIndex ?? entry.selectedTimelineIndex)
            : entry.selectedTimelineIndex,
          nextLayerNumber: Math.max(entry.nextLayerNumber, getNextLayerNumber(filteredLayers)),
        };
      });

      syncHistoryAvailability();
    },
    [clearLocalDrawingHistory, syncHistoryAvailability, trimGlobalHistoryEntriesToLimit],
  );

  const rebaseHistoryAfterLayerAddition = useCallback(
    (
      addedLayer: WorkspaceLayer,
      options?: {
        addedLayerIndex?: number;
        nextActiveLayerId?: string;
        nextCurrentFrameIndex?: number;
        nextSelectedTimelineIndex?: number;
        nextTimelineFrameId?: number;
        nextLayerNumber?: number;
      },
    ) => {
      if (historyEntriesRef.current.length === 0 || currentHistoryIndexRef.current < 0) {
        return;
      }

      trimGlobalHistoryEntriesToLimit();
      clearLocalDrawingHistory();

      historyEntriesRef.current = historyEntriesRef.current.map((entry, historyIndex) => {
        if (getLayerById(entry.layers, addedLayer.id)) {
          return entry;
        }

        const rebasedLayers = cloneWorkspaceLayers(entry.layers);
        const insertIndex = Math.max(0, Math.min(options?.addedLayerIndex ?? rebasedLayers.length, rebasedLayers.length));
        rebasedLayers.splice(insertIndex, 0, cloneWorkspaceLayer(addedLayer));
        const normalizedRebasedLayers = normalizeLayerOrder(rebasedLayers);
        const isCurrentEntry = historyIndex === currentHistoryIndexRef.current;

        return {
          ...entry,
          layers: normalizedRebasedLayers,
          activeLayerId: isCurrentEntry ? (options?.nextActiveLayerId ?? addedLayer.id) : entry.activeLayerId,
          currentFrameIndex: isCurrentEntry
            ? (options?.nextCurrentFrameIndex ?? entry.currentFrameIndex)
            : entry.currentFrameIndex,
          selectedTimelineIndex: isCurrentEntry
            ? (options?.nextSelectedTimelineIndex ?? entry.selectedTimelineIndex)
            : entry.selectedTimelineIndex,
          nextTimelineFrameId: Math.max(entry.nextTimelineFrameId, options?.nextTimelineFrameId ?? entry.nextTimelineFrameId),
          nextLayerNumber: Math.max(entry.nextLayerNumber, options?.nextLayerNumber ?? entry.nextLayerNumber),
        };
      });

      syncHistoryAvailability();
    },
    [clearLocalDrawingHistory, syncHistoryAvailability, trimGlobalHistoryEntriesToLimit],
  );

  const rebaseHistoryAfterTimelineSpanResize = useCallback(
    (
      layerId: string,
      stateId: number,
      spanType: "frame" | "tween",
      nextEndIndex: number,
      options?: {
        nextActiveLayerId?: string;
        nextCurrentFrameIndex?: number;
        nextSelectedTimelineIndex?: number;
        nextTimelineFrameId?: number;
      },
    ) => {
      if (historyEntriesRef.current.length === 0 || currentHistoryIndexRef.current < 0) {
        return;
      }

      trimGlobalHistoryEntriesToLimit();
      clearLocalDrawingHistory();

      historyEntriesRef.current = historyEntriesRef.current.map((entry, historyIndex) => {
        const targetLayer = getLayerById(entry.layers, layerId) ?? null;
        if (!targetLayer) {
          return entry;
        }

        const nextTimelineFrameIdCursor = { current: entry.nextTimelineFrameId } as MutableRefObject<number>;
        const targetLength = Math.max(0, nextEndIndex);
        const nextFrames = targetLayer.timelineFrames.slice();

        while (nextFrames.length <= targetLength) {
          nextFrames.push(createEmptyTimelineFrame(nextTimelineFrameIdCursor.current++));
        }

        const resizeResult = resizeTimelineSpanCells(nextFrames, stateId, spanType, nextEndIndex, nextTimelineFrameIdCursor);
        if (!resizeResult) {
          return entry;
        }

        cleanupTweenEndpointForState(nextFrames, stateId);
        const rebaseTimelineIndex = (index: number) => {
          let nextIndex = index;

          if (resizeResult.removedFrameCount > 0) {
            nextIndex =
              nextIndex >= resizeResult.removedStartIndex && nextIndex <= resizeResult.previousEndIndex
                ? resizeResult.spanEndIndex
                : nextIndex > resizeResult.previousEndIndex
                  ? nextIndex - resizeResult.removedFrameCount
                  : nextIndex;
          }

          if (resizeResult.insertedCount > 0 && nextIndex >= resizeResult.shiftBoundary) {
            nextIndex += resizeResult.insertedCount;
          }

          return Math.max(0, Math.min(nextIndex, nextFrames.length - 1));
        };
        const rebasedLayers = entry.layers.map((layer) =>
          layer.id === layerId
            ? {
                ...layer,
                timelineFrames: nextFrames,
              }
            : layer,
        );
        const isCurrentEntry = historyIndex === currentHistoryIndexRef.current;

        return {
          ...entry,
          layers: rebasedLayers,
          activeLayerId: isCurrentEntry ? (options?.nextActiveLayerId ?? entry.activeLayerId) : entry.activeLayerId,
          currentFrameIndex: isCurrentEntry
            ? (options?.nextCurrentFrameIndex ?? rebaseTimelineIndex(entry.currentFrameIndex))
            : rebaseTimelineIndex(entry.currentFrameIndex),
          selectedTimelineIndex: isCurrentEntry
            ? (options?.nextSelectedTimelineIndex ?? rebaseTimelineIndex(entry.selectedTimelineIndex))
            : rebaseTimelineIndex(entry.selectedTimelineIndex),
          nextTimelineFrameId: isCurrentEntry
            ? (options?.nextTimelineFrameId ?? nextTimelineFrameIdCursor.current)
            : nextTimelineFrameIdCursor.current,
        };
      });

      syncHistoryAvailability();
    },
    [clearLocalDrawingHistory, syncHistoryAvailability, trimGlobalHistoryEntriesToLimit],
  );

  const selectTimelinePosition = useCallback(
    (nextIndex: number) => {
      const clampedIndex = Math.max(0, nextIndex);
      selectedTimelineIndexRef.current = clampedIndex;
      setSelectedTimelineIndex(clampedIndex);
    },
    [],
  );

  const attachSoundOptionToFrame = useCallback(
    async (layerId: string, frameIndex: number, soundOption: DrawingAiSoundOption) => {
      if (!isSoundGenerationEnabled()) {
        console.warn(SOUND_GENERATION_DISABLED_MESSAGE, {
          soundOptionId: soundOption.id,
          frameIndex,
          layerId,
        });
        return false;
      }

      if (frameIndex < 0) {
        return false;
      }

      const targetLayer = getLayerById(layersRef.current, layerId) ?? null;
      if (!targetLayer) {
        return false;
      }

      let audioDataUrl: string | null = null;
      if (!isVoiceLikeSoundOption(soundOption)) {
        try {
          audioDataUrl = await synthesizeSoundOptionToDataUrl(soundOption);
        } catch (error) {
          console.warn("Failed to synthesize attached sound preview.", error);
        }
      }

      const nextSoundAttachment: WorkspaceSoundAttachment = {
        id: soundOption.id,
        title: soundOption.title,
        description: soundOption.description,
        timingFeel: soundOption.timingFeel ?? null,
        intensityFeel: soundOption.intensityFeel ?? null,
        audioDataUrl,
        contentType: soundOption.contentType === "voice-placeholder" ? "voice-placeholder" : "sfx",
        speechText: soundOption.speechText ?? null,
        sourceTask: "generate-sounds",
        attachedAt: new Date().toISOString(),
      };

      void preloadTimelineSoundAttachment(nextSoundAttachment);

      if (!isTimelinePlayingRef.current) {
        saveCurrentFrameSnapshotRef.current?.(currentFrameIndexRef.current, activeLayerIdRef.current, {
          debugCaller: "attachSoundOptionToFrame",
          forceCapture: drawingCanvasRef.current?.hasPendingAuthoringChanges() ?? true,
        });
      }

      const latestLayer = getLayerById(layersRef.current, layerId) ?? null;
      if (!latestLayer) {
        return false;
      }

      const nextFrames = ensureTimelineLength(latestLayer.timelineFrames, frameIndex);
      const latestFrame = nextFrames[frameIndex];
      if (!latestFrame) {
        return false;
      }

      nextFrames[frameIndex] = {
        ...latestFrame,
        soundAttachment: nextSoundAttachment,
      };

      recordUndoSnapshot();
      replaceLayerFrames(latestLayer.id, nextFrames);
      if (latestLayer.id === activeLayerIdRef.current) {
        timelineFramesRef.current = nextFrames;
      }
      commitCurrentHistoryState();
      return true;
    },
    [
      commitCurrentHistoryState,
      ensureTimelineLength,
      preloadTimelineSoundAttachment,
      recordUndoSnapshot,
      replaceLayerFrames,
    ],
  );

  const removeSoundAttachmentFromFrame = useCallback(
    (layerId: string, frameIndex: number) => {
      if (frameIndex < 0) {
        return false;
      }

      if (!isTimelinePlayingRef.current) {
        saveCurrentFrameSnapshotRef.current?.(currentFrameIndexRef.current, activeLayerIdRef.current, {
          debugCaller: "removeSoundAttachmentFromFrame",
          forceCapture: drawingCanvasRef.current?.hasPendingAuthoringChanges() ?? true,
        });
      }

      const targetLayer = getLayerById(layersRef.current, layerId) ?? null;
      const targetFrame = targetLayer?.timelineFrames[frameIndex] ?? null;
      if (!targetLayer || !targetFrame?.soundAttachment) {
        return false;
      }

      const nextFrames = targetLayer.timelineFrames.slice();
      nextFrames[frameIndex] = {
        ...targetFrame,
        soundAttachment: null,
      };

      recordUndoSnapshot();
      replaceLayerFrames(targetLayer.id, nextFrames);
      if (targetLayer.id === activeLayerIdRef.current) {
        timelineFramesRef.current = nextFrames;
      }
      commitCurrentHistoryState();
      return true;
    },
    [commitCurrentHistoryState, recordUndoSnapshot, replaceLayerFrames],
  );

  const copyTimelineFrame = useCallback((layerId: string, frameIndex: number) => {
    const targetLayer = getLayerById(layersRef.current, layerId) ?? null;
    if (!targetLayer) {
      return false;
    }

    const copiedFrame = resolveCopiedTimelineFrame(targetLayer.timelineFrames, frameIndex, layerId);
    if (!copiedFrame) {
      return false;
    }

    copiedTimelineFrameRef.current = copiedFrame;
    setHasCopiedTimelineFrame(true);
    return true;
  }, []);

  const pasteTimelineFrame = useCallback(
    (layerId: string, targetIndex: number) => {
      const copiedFrame = copiedTimelineFrameRef.current;
      if (!copiedFrame) {
        return false;
      }

      if (layerId !== activeLayerIdRef.current) {
        saveCurrentFrameSnapshotRef.current?.(currentFrameIndexRef.current, activeLayerIdRef.current, {
          debugCaller: "pasteTimelineFrame:commit-active-layer",
          forceCapture: drawingCanvasRef.current?.hasPendingAuthoringChanges() ?? true,
        });
      } else {
        saveCurrentFrameSnapshotRef.current?.(currentFrameIndexRef.current, layerId, {
          debugCaller: "pasteTimelineFrame:commit-target-layer",
          forceCapture: drawingCanvasRef.current?.hasPendingAuthoringChanges() ?? true,
        });
      }

      const latestLayer = getLayerById(layersRef.current, layerId) ?? null;
      if (!latestLayer) {
        return false;
      }

      const clampedTargetIndex = Math.max(0, targetIndex);
      const nextFrames = ensureTimelineLength(latestLayer.timelineFrames, clampedTargetIndex);
      const targetFrame = nextFrames[clampedTargetIndex] ?? null;
      if (!targetFrame) {
        return false;
      }

      const previousStateId = targetFrame.cellType !== "empty" ? targetFrame.stateId : null;
      const copiedSnapshot =
        copiedFrame.cellType === "blank-keyframe"
          ? { bitmap: null, previewUrl: null }
          : {
              bitmap: cloneBitmap(copiedFrame.snapshot.bitmap),
              previewUrl: copiedFrame.snapshot.previewUrl ?? null,
            };
      const nextFrame: WorkspaceTimelineFrame = {
        ...createTimelineFrame(targetFrame.id, "keyframe", copiedFrame.cellType, targetFrame.id, copiedSnapshot),
        soundAttachment: copiedFrame.soundAttachment ? { ...copiedFrame.soundAttachment } : null,
        textObjects: cloneWorkspaceTextObjects(copiedFrame.textObjects),
      };

      nextFrames[clampedTargetIndex] = nextFrame;
      if (previousStateId !== null && previousStateId !== nextFrame.stateId) {
        reassignTrailingStateCellsToHold(nextFrames, clampedTargetIndex, previousStateId, nextFrame.stateId);
        cleanupTweenEndpointForState(nextFrames, previousStateId);
      }

      const pasteContextKeys = nextFrames
        .filter((frame) => frame.stateId === nextFrame.stateId && frame.cellType !== "empty")
        .map((frame) => `${layerId}:${frame.id}:bitmap`);

      const nextLayers = replaceLayerFrames(layerId, nextFrames);
      activeLayerIdRef.current = layerId;
      timelineFramesRef.current = nextFrames;
      currentFrameIndexRef.current = clampedTargetIndex;
      selectedTimelineIndexRef.current = clampedTargetIndex;
      setActiveLayerId(layerId);
      setCurrentFrameIndex(clampedTargetIndex);
      setSelectedTimelineIndex(clampedTargetIndex);
      setLocalDrawingHistoryBaselines(
        pasteContextKeys.length > 0 ? pasteContextKeys : [`${layerId}:${targetFrame.id}:bitmap`],
      );
      if (currentHistoryIndexRef.current >= 0 && historyEntriesRef.current.length > currentHistoryIndexRef.current + 1) {
        historyEntriesRef.current = historyEntriesRef.current.slice(0, currentHistoryIndexRef.current + 1);
      }
      updateHistoryWorkspaceStamp("local-drawing");
      syncHistoryAvailability();

      window.requestAnimationFrame(() => {
        drawingCanvasRef.current?.clearTransientEditingState();
        renderWorkspaceCanvases(nextLayers, clampedTargetIndex, {
          activeLayerId: layerId,
          debugCaller: "pasteTimelineFrame",
        });
      });

      return true;
    },
    [
      ensureTimelineLength,
      renderWorkspaceCanvases,
      replaceLayerFrames,
      setLocalDrawingHistoryBaselines,
      syncHistoryAvailability,
      updateHistoryWorkspaceStamp,
    ],
  );

  const updateFrameTextObjects = useCallback((
    frameIndex: number,
    nextTextObjects: DrawingTextObject[],
    layerId = activeLayerIdRef.current,
  ) => {
    if (layerId === activeLayerIdRef.current) {
      saveCurrentFrameSnapshotRef.current?.(frameIndex, layerId, {
        debugCaller: "updateFrameTextObjects:commit-active-layer",
        forceCapture: drawingCanvasRef.current?.hasPendingAuthoringChanges() ?? false,
      });
    }

    const frames = getLayerById(layersRef.current, layerId)?.timelineFrames ?? [];
    const stateStartIndex = resolveStateStartIndex(frames, frameIndex);
    if (stateStartIndex < 0) {
      return false;
    }

    const currentStateFrame = frames[stateStartIndex] ?? null;
    if (!currentStateFrame) {
      return false;
    }

    const normalizedTextObjects = cloneWorkspaceTextObjects(nextTextObjects.map((textObject) => ({
      ...textObject,
      fontFamily: (
        textObject.fontFamily === "Verdana" ||
        textObject.fontFamily === "Georgia" ||
        textObject.fontFamily === "Times New Roman" ||
        textObject.fontFamily === "Courier New"
      )
        ? textObject.fontFamily
        : DEFAULT_DRAWING_TEXT_FONT,
      fontSize: Math.max(10, textObject.fontSize),
      width: Math.max(32, textObject.width),
      flipX: Boolean(textObject.flipX),
      flipY: Boolean(textObject.flipY),
      rotation: normalizeDrawingTextRotation(textObject.rotation),
      color: /^#[0-9a-fA-F]{6}$/.test(textObject.color) ? textObject.color : DEFAULT_DRAWING_TEXT_COLOR,
      text: textObject.text,
    })));

    if (drawingTextObjectsEqual(currentStateFrame.textObjects, normalizedTextObjects)) {
      return true;
    }

    const localDrawingContext = resolveLocalDrawingHistoryContext(layerId, frameIndex);
    const useLocalDrawingHistory = Boolean(
      localDrawingContext &&
      localDrawingContext.target === "bitmap" &&
      localDrawingContext.targetFrameId === currentStateFrame.id,
    );

    if (!useLocalDrawingHistory) {
      recordUndoSnapshot();
    }

    const nextFrames = frames.slice();
    const nextCellType =
      currentStateFrame.cellType === "blank-keyframe" && normalizedTextObjects.length > 0
        ? "keyframe"
        : currentStateFrame.cellType;
    const nextFrame: WorkspaceTimelineFrame = {
      ...currentStateFrame,
      kind: nextCellType === "tween" ? "tween" : "keyframe",
      cellType: nextCellType,
      isBlank: nextCellType === "blank-keyframe",
      textObjects: normalizedTextObjects,
    };
    nextFrames[stateStartIndex] = nextFrame;

    if (useLocalDrawingHistory && localDrawingContext) {
      pushLocalDrawingHistoryEntry({
        kind: "metadata",
        contextKey: localDrawingContext.key,
        layerId,
        viewFrameId: localDrawingContext.viewFrameId,
        targetFrameId: localDrawingContext.targetFrameId,
        target: localDrawingContext.target,
        beforeFrameMeta: cloneWorkspaceTimelineFrameMetadata(currentStateFrame),
        afterFrameMeta: cloneWorkspaceTimelineFrameMetadata(nextFrame),
      });
    }

    const preserveTimelineRowView = timelineFrameMatchesRowView(nextFrame, currentStateFrame);
    replaceLayerFrames(layerId, nextFrames, { preserveTimelineRowView });
    if (layerId === activeLayerIdRef.current) {
      timelineFramesRef.current = nextFrames;
    }
    commitCurrentHistoryState({
      assumeChanged: true,
      owner:
        useLocalDrawingHistory && localDrawingContext
          ? {
              kind: "local-drawing",
              contextKey: localDrawingContext.key,
              layerId,
              viewFrameId: localDrawingContext.viewFrameId,
              targetFrameId: currentStateFrame.id,
              target: "bitmap",
            }
          : undefined,
    });

    return true;
  }, [
    commitCurrentHistoryState,
    pushLocalDrawingHistoryEntry,
    recordUndoSnapshot,
    replaceLayerFrames,
    resolveLocalDrawingHistoryContext,
  ]);

  const updateFrameSnapshot = useCallback((
    frameIndex: number,
    snapshot: TimelineFrameSnapshot | null,
    layerId = activeLayerIdRef.current,
    options?: { assumeBitmapChanged?: boolean },
  ) => {
    const frames = getLayerById(layersRef.current, layerId)?.timelineFrames ?? [];
    const stateStartIndex = resolveStateStartIndex(frames, frameIndex);
    if (stateStartIndex < 0) {
      return adoptSnapshot(snapshot);
    }

    const nextFrames = frames.slice();
    const currentStateFrame = nextFrames[stateStartIndex];
    const didBitmapChange = options?.assumeBitmapChanged ? true : !snapshotBitmapMatches(currentStateFrame.bitmap, snapshot);
    const localDrawingContext = didBitmapChange ? resolveLocalDrawingHistoryContext(layerId, frameIndex) : null;
    const useLocalDrawingHistory = Boolean(
      localDrawingContext &&
        localDrawingContext.target === "bitmap" &&
        localDrawingContext.targetFrameId === currentStateFrame.id,
    );
    const hasDirtyPatch = hasSnapshotDirtyPatch(snapshot);
    const patchCoversWholeBitmap =
      hasDirtyPatch &&
      snapshot.dirtyPatchRect.left === 0 &&
      snapshot.dirtyPatchRect.top === 0 &&
      snapshot.dirtyPatchRect.width === snapshot.bitmapWidth &&
      snapshot.dirtyPatchRect.height === snapshot.bitmapHeight;
    const beforePatchBitmap =
      useLocalDrawingHistory && hasDirtyPatch
        ? captureBitmapPatch(currentStateFrame.bitmap, snapshot.dirtyPatchRect)
        : null;
    if (didBitmapChange && !useLocalDrawingHistory) {
      recordUndoSnapshot();
    }
    const canMutateCurrentBitmap =
      didBitmapChange &&
      hasDirtyPatch &&
      !patchCoversWholeBitmap &&
      useLocalDrawingHistory &&
      ensureDetachedLocalHistoryBitmap(localDrawingContext, currentStateFrame.bitmap);
    if (canMutateCurrentBitmap) {
      invalidateBitmapRenderCaches(currentStateFrame.bitmap);
      primeOpaqueBoundsCacheFromDirtyPatch(currentStateFrame.bitmap, currentStateFrame.bitmap, snapshot);
    }

    const isolatedSnapshot: TimelineFrameSnapshot = {
      bitmap: didBitmapChange
        ? materializeSnapshotBitmap(
            snapshot,
            currentStateFrame.bitmap,
            canMutateCurrentBitmap ? { mutateCurrentBitmap: true } : undefined,
          )
        : currentStateFrame.bitmap,
      previewUrl: snapshot ? snapshot.previewUrl : null,
    };
    if (didBitmapChange && !canMutateCurrentBitmap) {
      primeOpaqueBoundsCacheFromDirtyPatch(isolatedSnapshot.bitmap, currentStateFrame.bitmap, snapshot);
    }
    const tweenSpan = resolveTweenSpan(nextFrames, stateStartIndex);
    const nextPreviewUrl = resolveSnapshotPreviewUrl({
      nextPreviewUrl: isolatedSnapshot.previewUrl,
      existingPreviewUrl: currentStateFrame.previewUrl,
      didBitmapChange,
    });
    const nextCellType =
      currentStateFrame.cellType === "blank-keyframe" && isolatedSnapshot.bitmap ? "keyframe" : currentStateFrame.cellType;
    const nextKind = nextCellType === "tween" ? "tween" : "keyframe";
    const persistedStateFrame: WorkspaceTimelineFrame = {
      ...nextFrames[stateStartIndex],
      kind: nextKind,
      cellType: nextCellType,
      isBlank: nextCellType === "blank-keyframe",
      bitmap: isolatedSnapshot.bitmap,
      previewUrl: nextPreviewUrl,
      motionTween: tweenSpan ? nextFrames[stateStartIndex].motionTween : null,
    };
    nextFrames[stateStartIndex] = persistedStateFrame;

    const nextMotionTweenResult = tweenSpan
      ? buildMotionTweenFromStartSnapshot(persistedStateFrame.bitmap, currentStateFrame.motionTween)
      : null;
    const nextMotionTween =
      tweenSpan && nextMotionTweenResult?.status === "success"
        ? nextMotionTweenResult.motionTween
        : null;
    const nextHasTweenEndpoint = tweenSpan
      ? Boolean(persistedStateFrame.tweenEndBitmap && hasCompleteMotionTweenData(nextMotionTween))
      : Boolean(persistedStateFrame.hasTweenEndpoint);

    if (tweenSpan) {
      nextFrames[stateStartIndex] = {
        ...persistedStateFrame,
        hasTweenEndpoint: nextHasTweenEndpoint,
        motionTween: nextMotionTween,
      };
    }

    const ownerValidity = tweenSpan ? classifyMotionTweenOwnerValidity(nextFrames, stateStartIndex) : null;

    if (tweenSpan && nextMotionTweenResult?.status === "invalid") {
      motionTweenWarn("updateFrameSnapshot:motion-derivation-invalid", {
        layerId,
        frameIndex,
        stateStartIndex,
        stateId: currentStateFrame.stateId,
        bitmap: summarizeBitmapForMotionTweenDebug(persistedStateFrame.bitmap),
        reason: nextMotionTweenResult.reason,
        hasSavedEndBitmap: Boolean(persistedStateFrame.tweenEndBitmap),
        hasTweenEndpoint: nextHasTweenEndpoint,
        ownerValidityReason: ownerValidity?.reason ?? null,
        ownerValidity: ownerValidity?.debugMeta ?? null,
        ...nextMotionTweenResult.debugMeta,
      });
    }

    if (ENABLE_MOTION_TWEEN_DEBUG) {
      motionTweenDebug("updateFrameSnapshot", {
        layerId,
        frameIndex,
        stateStartIndex,
        stateId: currentStateFrame.stateId,
        bitmap: summarizeBitmapForMotionTweenDebug(persistedStateFrame.bitmap),
        previewUrlPreserved: isolatedSnapshot.previewUrl === undefined,
        previewUrlExists: Boolean(nextPreviewUrl),
        hasSavedEndBitmap: Boolean(persistedStateFrame.tweenEndBitmap),
        hasTweenEndpoint: nextHasTweenEndpoint,
        ownerValidityReason: ownerValidity?.reason ?? null,
        ownerValidity: ownerValidity?.debugMeta ?? null,
        motionTweenResult: nextMotionTweenResult?.status ?? "not_applicable",
        motionTween: summarizeMotionTweenForDebug(nextMotionTween),
      });
    }

    const finalPersistedFrame = nextFrames[stateStartIndex] ?? persistedStateFrame;
    if (useLocalDrawingHistory && localDrawingContext) {
      pushLocalDrawingHistoryEntry(
        createLocalDrawingHistoryEntry({
          context: localDrawingContext,
          currentFrame: currentStateFrame,
          nextFrame: finalPersistedFrame,
          snapshot,
          beforePatchBitmapOverride: beforePatchBitmap,
        }),
      );
    }

    const preserveTimelineRowView = timelineFrameMatchesRowView(finalPersistedFrame, currentStateFrame);
    replaceLayerFrames(layerId, nextFrames, { preserveTimelineRowView });
    if (layerId === activeLayerIdRef.current) {
      timelineFramesRef.current = nextFrames;
    }
    if (didBitmapChange) {
      commitCurrentHistoryState({
        assumeChanged: true,
        owner:
          useLocalDrawingHistory && localDrawingContext
            ? {
                kind: "local-drawing",
                contextKey: localDrawingContext.key,
                layerId,
                viewFrameId: localDrawingContext.viewFrameId,
                targetFrameId: currentStateFrame.id,
                target: "bitmap",
              }
            : undefined,
      });
    }
    return {
      bitmap: persistedStateFrame.bitmap,
      previewUrl: nextPreviewUrl,
    };
  }, [
    commitCurrentHistoryState,
    ensureDetachedLocalHistoryBitmap,
    pushLocalDrawingHistoryEntry,
    recordUndoSnapshot,
    replaceLayerFrames,
    resolveLocalDrawingHistoryContext,
  ]);

  const updateTweenEndSnapshot = useCallback((
    frameIndex: number,
    snapshot: TimelineFrameSnapshot | null,
    layerId = activeLayerIdRef.current,
    options?: { assumeBitmapChanged?: boolean },
  ) => {
    const frames = getLayerById(layersRef.current, layerId)?.timelineFrames ?? [];
    const tweenSpan = resolveTweenSpan(frames, frameIndex);
    if (!tweenSpan) {
      motionTweenWarn("updateTweenEndSnapshot:missing-tween-span", {
        layerId,
        frameIndex,
      });
      return adoptSnapshot(snapshot);
    }

    const nextFrames = frames.slice();
    const ownerFrame = nextFrames[tweenSpan.ownerIndex];
    const didBitmapChange = options?.assumeBitmapChanged ? true : !snapshotBitmapMatches(ownerFrame?.tweenEndBitmap ?? null, snapshot);
    const localDrawingContext = didBitmapChange ? resolveLocalDrawingHistoryContext(layerId, frameIndex) : null;
    const useLocalDrawingHistory = Boolean(
      localDrawingContext &&
        ownerFrame &&
        localDrawingContext.target === "tweenEndBitmap" &&
        localDrawingContext.targetFrameId === ownerFrame.id,
    );
    const hasDirtyPatch = hasSnapshotDirtyPatch(snapshot);
    const patchCoversWholeBitmap =
      hasDirtyPatch &&
      snapshot.dirtyPatchRect.left === 0 &&
      snapshot.dirtyPatchRect.top === 0 &&
      snapshot.dirtyPatchRect.width === snapshot.bitmapWidth &&
      snapshot.dirtyPatchRect.height === snapshot.bitmapHeight;
    const beforePatchBitmap =
      useLocalDrawingHistory && hasDirtyPatch
        ? captureBitmapPatch(ownerFrame?.tweenEndBitmap ?? null, snapshot.dirtyPatchRect)
        : null;
    if (didBitmapChange && !useLocalDrawingHistory) {
      recordUndoSnapshot();
    }
    const canMutateCurrentBitmap =
      didBitmapChange &&
      hasDirtyPatch &&
      !patchCoversWholeBitmap &&
      useLocalDrawingHistory &&
      ensureDetachedLocalHistoryBitmap(localDrawingContext, ownerFrame?.tweenEndBitmap ?? null);
    if (canMutateCurrentBitmap) {
      invalidateBitmapRenderCaches(ownerFrame?.tweenEndBitmap ?? null);
      primeOpaqueBoundsCacheFromDirtyPatch(ownerFrame?.tweenEndBitmap ?? null, ownerFrame?.tweenEndBitmap ?? null, snapshot);
    }

    const isolatedSnapshot: TimelineFrameSnapshot = {
      bitmap: didBitmapChange
        ? materializeSnapshotBitmap(
            snapshot,
            ownerFrame?.tweenEndBitmap ?? null,
            canMutateCurrentBitmap ? { mutateCurrentBitmap: true } : undefined,
          )
        : (ownerFrame?.tweenEndBitmap ?? null),
      previewUrl: snapshot ? snapshot.previewUrl : null,
    };
    if (didBitmapChange && !canMutateCurrentBitmap) {
      primeOpaqueBoundsCacheFromDirtyPatch(isolatedSnapshot.bitmap, ownerFrame?.tweenEndBitmap ?? null, snapshot);
    }
    const nextPreviewUrl = resolveSnapshotPreviewUrl({
      nextPreviewUrl: isolatedSnapshot.previewUrl,
      existingPreviewUrl: ownerFrame?.tweenEndPreviewUrl ?? null,
      didBitmapChange,
    });
    const persistedOwnerFrame: WorkspaceTimelineFrame = {
      ...nextFrames[tweenSpan.ownerIndex],
      hasTweenEndpoint: false,
      tweenEndBitmap: isolatedSnapshot.bitmap,
      tweenEndPreviewUrl: nextPreviewUrl,
    };
    nextFrames[tweenSpan.ownerIndex] = persistedOwnerFrame;

    const nextMotionTweenResult = buildMotionTweenFromEndpointSnapshots(
      persistedOwnerFrame.bitmap,
      persistedOwnerFrame.tweenEndBitmap,
      ownerFrame?.motionTween ?? null,
    );

    let nextMotionTween: MotionTweenData | null = null;
    if (nextMotionTweenResult.status === "success" || nextMotionTweenResult.status === "clear") {
      nextMotionTween = nextMotionTweenResult.motionTween ?? null;
    } else {
      const startMotionTweenResult = buildMotionTweenFromStartSnapshot(
        persistedOwnerFrame.bitmap,
        ownerFrame?.motionTween ?? null,
      );
      nextMotionTween = startMotionTweenResult.status === "success"
        ? {
            ...startMotionTweenResult.motionTween,
            endOrigin: null,
          }
        : null;
      motionTweenWarn("updateTweenEndSnapshot:motion-derivation-invalid", {
        layerId,
        frameIndex,
        ownerIndex: tweenSpan.ownerIndex,
        stateId: tweenSpan.ownerFrame.stateId,
        hasSavedEndBitmap: Boolean(persistedOwnerFrame.tweenEndBitmap),
        hasTweenEndpoint: false,
        tweenEndBitmap: summarizeBitmapForMotionTweenDebug(persistedOwnerFrame.tweenEndBitmap),
        reason: nextMotionTweenResult.reason,
        ...nextMotionTweenResult.debugMeta,
      });
    }

    const nextHasTweenEndpoint = Boolean(persistedOwnerFrame.tweenEndBitmap && hasCompleteMotionTweenData(nextMotionTween));

    nextFrames[tweenSpan.ownerIndex] = {
      ...persistedOwnerFrame,
      hasTweenEndpoint: nextHasTweenEndpoint,
      motionTween: nextMotionTween,
    };

    const ownerValidity = classifyMotionTweenOwnerValidity(nextFrames, tweenSpan.ownerIndex);

    if (ENABLE_MOTION_TWEEN_DEBUG) {
      motionTweenDebug("updateTweenEndSnapshot", {
        layerId,
        frameIndex,
        ownerIndex: tweenSpan.ownerIndex,
        stateId: tweenSpan.ownerFrame.stateId,
        hasSavedEndBitmap: Boolean(persistedOwnerFrame.tweenEndBitmap),
        hasTweenEndpoint: nextHasTweenEndpoint,
        tweenEndBitmap: summarizeBitmapForMotionTweenDebug(persistedOwnerFrame.tweenEndBitmap),
        previewUrlPreserved: isolatedSnapshot.previewUrl === undefined,
        previewUrlExists: Boolean(nextPreviewUrl),
        ownerValidityReason: ownerValidity.reason,
        ownerValidity: ownerValidity.debugMeta,
        motionTweenResult: nextMotionTweenResult.status,
        motionTween: summarizeMotionTweenForDebug(nextMotionTween),
      });
    }

    const finalPersistedOwnerFrame = nextFrames[tweenSpan.ownerIndex] ?? persistedOwnerFrame;
    if (useLocalDrawingHistory && localDrawingContext && ownerFrame) {
      pushLocalDrawingHistoryEntry(
        createLocalDrawingHistoryEntry({
          context: localDrawingContext,
          currentFrame: ownerFrame,
          nextFrame: finalPersistedOwnerFrame,
          snapshot,
          beforePatchBitmapOverride: beforePatchBitmap,
        }),
      );
    }

    const preserveTimelineRowView = timelineFrameMatchesRowView(finalPersistedOwnerFrame, ownerFrame);
    replaceLayerFrames(layerId, nextFrames, { preserveTimelineRowView });
    if (layerId === activeLayerIdRef.current) {
      timelineFramesRef.current = nextFrames;
    }
    if (didBitmapChange) {
      commitCurrentHistoryState({
        assumeChanged: true,
        owner:
          useLocalDrawingHistory &&
          localDrawingContext &&
          ownerFrame
            ? {
                kind: "local-drawing",
                contextKey: localDrawingContext.key,
                layerId,
                viewFrameId: localDrawingContext.viewFrameId,
                targetFrameId: ownerFrame.id,
                target: "tweenEndBitmap",
              }
            : undefined,
      });
    }
    return {
      bitmap: persistedOwnerFrame.tweenEndBitmap,
      previewUrl: nextPreviewUrl,
    };
  }, [
    commitCurrentHistoryState,
    ensureDetachedLocalHistoryBitmap,
    pushLocalDrawingHistoryEntry,
    recordUndoSnapshot,
    replaceLayerFrames,
    resolveLocalDrawingHistoryContext,
  ]);

  const saveCurrentFrameSnapshot = useCallback(
    (
      frameIndex = currentFrameIndexRef.current,
      layerId = activeLayerIdRef.current,
      options?: { captureOptions?: DrawingCanvasSnapshotOptions; debugCaller?: string; forceCapture?: boolean },
    ) => {
      const frames = getLayerById(layersRef.current, layerId)?.timelineFrames ?? [];
      const forceCapture = options?.forceCapture === true;
      const hasPendingAuthoringChanges =
        layerId === activeLayerIdRef.current
          ? (drawingCanvasRef.current?.hasPendingAuthoringChanges() ?? true)
          : true;
      const includePreviewUrl = options?.captureOptions?.includePreviewUrl ?? false;
      const captureOptions: DrawingCanvasSnapshotOptions = {
        ...options?.captureOptions,
        includePreviewUrl,
        preferIncrementalBitmapCapture: options?.captureOptions?.preferIncrementalBitmapCapture ?? !includePreviewUrl,
      };

      if (!forceCapture && !hasPendingAuthoringChanges) {
        return null;
      }

      const assumeBitmapChanged = layerId === activeLayerIdRef.current && hasPendingAuthoringChanges;

      const currentFrame = frames[frameIndex];
      if (currentFrame?.cellType === "tween") {
        const tweenEditContext = resolveTweenEditContext(frames, frameIndex, layerId);
        const snapshot = captureCanvasSnapshot(captureOptions);
        motionTweenDebug("saveCurrentFrameSnapshot:tween-attempt", {
          layerId,
          frameIndex,
          debugCaller: options?.debugCaller ?? "unknown",
          currentCellType: currentFrame.cellType,
          tweenEditContext,
          stateStartIndex: resolveStateStartIndex(frames, frameIndex),
          includePreviewUrl: captureOptions.includePreviewUrl !== false,
          capturedSnapshot: summarizeBitmapForMotionTweenDebug(snapshot?.bitmap ?? null),
        });
        if (!snapshot) {
          motionTweenWarn("saveCurrentFrameSnapshot:tween-no-snapshot", {
            layerId,
            frameIndex,
            tweenEditContext,
          });
          return null;
        }

        const stateStartIndex = resolveStateStartIndex(frames, frameIndex);
        const resolvedSnapshot = resolveTimelineSnapshot(frames, frameIndex, { tweenEditContext });
        const areBitmapsEqual = assumeBitmapChanged ? false : snapshotBitmapMatches(resolvedSnapshot.bitmap, snapshot);
        const editSide = resolveTweenEditSide(frames, frameIndex, tweenEditContext);
        motionTweenDebug("saveCurrentFrameSnapshot:tween-compare", {
          layerId,
          frameIndex,
          tweenEditContext,
          stateStartIndex,
          editSide,
          capturedSnapshot: summarizeBitmapForMotionTweenDebug(snapshot.bitmap),
          resolvedSnapshot: summarizeBitmapForMotionTweenDebug(resolvedSnapshot.bitmap),
          bitmapsEqual: areBitmapsEqual,
        });
        if (!editSide) {
          motionTweenError("saveCurrentFrameSnapshot:missing-edit-context", {
            layerId,
            frameIndex,
            tweenEditContext,
            stateStartIndex,
            currentFrame,
          });
          return null;
        }
        if (!areBitmapsEqual) {
          if (editSide === "start") {
            motionTweenDebug("saveCurrentFrameSnapshot:tween-route", {
              layerId,
              frameIndex,
              chosenPath: "updateFrameSnapshot",
              editSide,
              stateStartIndex,
            });
            const persistedSnapshot = updateFrameSnapshot(frameIndex, snapshot, layerId, {
              assumeBitmapChanged,
            });
            if (layerId === activeLayerIdRef.current) {
              drawingCanvasRef.current?.markAuthoringChangesCommitted(
                persistedSnapshot.bitmap,
                snapshot.captureVersion ?? null,
              );
            }
            return persistedSnapshot;
          }

          motionTweenDebug("saveCurrentFrameSnapshot:tween-route", {
            layerId,
            frameIndex,
            chosenPath: "updateTweenEndSnapshot",
            editSide,
            stateStartIndex,
          });
          const persistedSnapshot = updateTweenEndSnapshot(frameIndex, snapshot, layerId, {
            assumeBitmapChanged,
          });
          if (layerId === activeLayerIdRef.current) {
            drawingCanvasRef.current?.markAuthoringChangesCommitted(
              persistedSnapshot.bitmap,
              snapshot.captureVersion ?? null,
            );
          }
          return persistedSnapshot;
        }

        motionTweenDebug("saveCurrentFrameSnapshot:tween-no-change", {
          layerId,
          frameIndex,
          tweenEditContext,
        });
        if (layerId === activeLayerIdRef.current) {
          drawingCanvasRef.current?.markAuthoringChangesCommitted(
            resolvedSnapshot.bitmap,
            snapshot.captureVersion ?? null,
          );
        }
        return null;
      }

      if (!canPersistFrameSnapshot(frames, frameIndex)) {
        return null;
      }

      const snapshot = captureCanvasSnapshot(captureOptions);
      const persistedSnapshot = updateFrameSnapshot(frameIndex, snapshot, layerId, {
        assumeBitmapChanged,
      });
      if (layerId === activeLayerIdRef.current) {
        drawingCanvasRef.current?.markAuthoringChangesCommitted(
          persistedSnapshot.bitmap,
          snapshot?.captureVersion ?? null,
        );
      }
      return persistedSnapshot;
    },
    [captureCanvasSnapshot, updateFrameSnapshot, updateTweenEndSnapshot],
  );
  saveCurrentFrameSnapshotRef.current = saveCurrentFrameSnapshot;

  const commitCanvasAuthoringAction = useCallback((reason: CanvasAuthoringActionReason) => {
    if (isTimelinePlayingRef.current || isApplyingHistoryRef.current) {
      return;
    }

    const currentFrame = timelineFramesRef.current[currentFrameIndexRef.current] ?? null;
    if (!currentFrame || currentFrame.cellType === "empty") {
      return;
    }

    if (!drawingCanvasRef.current?.hasPendingAuthoringChanges()) {
      return;
    }

    saveCurrentFrameSnapshot(currentFrameIndexRef.current, activeLayerIdRef.current, {
      captureOptions: { includePreviewUrl: false, preferIncrementalBitmapCapture: true },
      debugCaller: `canvas-action:${reason}`,
      forceCapture: true,
    });
  }, [saveCurrentFrameSnapshot]);

  const activateLayer = useCallback(
    (layerId: string) => {
      const nextActiveLayer = getLayerById(layersRef.current, layerId);
      if (!nextActiveLayer || nextActiveLayer.id === activeLayerIdRef.current) {
        return;
      }

      if (!isTimelinePlayingRef.current) {
        saveCurrentFrameSnapshot(currentFrameIndexRef.current, activeLayerIdRef.current, {
          debugCaller: "activateLayer",
          forceCapture: drawingCanvasRef.current?.hasPendingAuthoringChanges() ?? true,
        });
      }

      activeLayerIdRef.current = nextActiveLayer.id;
      timelineFramesRef.current = nextActiveLayer.timelineFrames;
      setActiveLayerId(nextActiveLayer.id);

      window.requestAnimationFrame(() => {
        renderWorkspaceCanvases(layersRef.current, currentFrameIndexRef.current, {
          playback: isTimelinePlayingRef.current,
          activeLayerId: nextActiveLayer.id,
          debugCaller: "activateLayer",
        });
      });
    },
    [renderWorkspaceCanvases, saveCurrentFrameSnapshot],
  );

  const switchToFrame = useCallback(
    (nextIndex: number) => {
      const layers = layersRef.current;
      const frameCount = getGlobalTimelineFrameCount(layers);
      if (!frameCount) return;

      const clampedIndex = Math.max(0, Math.min(nextIndex, frameCount - 1));
      const currentIndex = currentFrameIndexRef.current;
      motionTweenDebug("DrawingWorkspace:switchToFrame:request", {
        requestedNextIndex: nextIndex,
        clampedIndex,
        currentFrameIndexBefore: currentIndex,
        selectedTimelineIndexBefore: selectedTimelineIndexRef.current,
      });
      const resolvedActiveLayer = getLayerById(layers, activeLayerIdRef.current) ?? layers[0] ?? null;
      if (clampedIndex === currentIndex) {
        selectedTimelineIndexRef.current = clampedIndex;
        setSelectedTimelineIndex(clampedIndex);
        motionTweenDebug("switchToFrame:resolved-context", {
          activeLayerId: resolvedActiveLayer?.id ?? null,
          currentFrameIndex: currentIndex,
          selectedTimelineIndex: clampedIndex,
          didSwitchCurrentFrame: false,
          activeTweenEditContext: resolvedActiveLayer
            ? resolveTweenEditContext(resolvedActiveLayer.timelineFrames, clampedIndex, resolvedActiveLayer.id)
            : null,
        });
        return;
      }

      if (!isTimelinePlayingRef.current) {
        saveCurrentFrameSnapshot(currentIndex, activeLayerIdRef.current, {
          debugCaller: "switchToFrame",
          forceCapture: drawingCanvasRef.current?.hasPendingAuthoringChanges() ?? true,
        });
      }

      currentFrameIndexRef.current = clampedIndex;
      setCurrentFrameIndex(clampedIndex);
      selectedTimelineIndexRef.current = clampedIndex;
      setSelectedTimelineIndex(clampedIndex);
      motionTweenDebug("switchToFrame:resolved-context", {
        activeLayerId: resolvedActiveLayer?.id ?? null,
        currentFrameIndex: clampedIndex,
        selectedTimelineIndex: clampedIndex,
        didSwitchCurrentFrame: true,
        activeTweenEditContext: resolvedActiveLayer
          ? resolveTweenEditContext(resolvedActiveLayer.timelineFrames, clampedIndex, resolvedActiveLayer.id)
          : null,
      });

      window.requestAnimationFrame(() => {
        renderWorkspaceCanvases(layersRef.current, clampedIndex, {
          playback: isTimelinePlayingRef.current,
          activeLayerId: activeLayerIdRef.current,
          debugCaller: "switchToFrame",
        });
      });
    },
    [renderWorkspaceCanvases, saveCurrentFrameSnapshot],
  );

  const advancePlaybackFrames = useCallback(
    (steps: number, options?: { syncUiState?: boolean }) => {
      if (steps <= 0) {
        return { didAdvance: false, shouldStopPlayback: false };
      }

      let nextIndex = currentFrameIndexRef.current;
      let didAdvance = false;
      const visitedFrameIndices: number[] = [];

      for (let step = 0; step < steps; step += 1) {
        const frameCount = getAuthoredPlaybackFrameCountForLayers(layersRef.current);
        if (frameCount <= 1) {
          return { didAdvance, shouldStopPlayback: true };
        }

        nextIndex = nextIndex >= frameCount - 1 ? 0 : nextIndex + 1;
        didAdvance = true;
        visitedFrameIndices.push(nextIndex);
      }

      if (!didAdvance) {
        return { didAdvance: false, shouldStopPlayback: false };
      }

      currentFrameIndexRef.current = nextIndex;
      selectedTimelineIndexRef.current = nextIndex;
      if (options?.syncUiState !== false) {
        startTransition(() => {
          setCurrentFrameIndex(nextIndex);
          setSelectedTimelineIndex(nextIndex);
        });
      }
      renderWorkspaceCanvases(layersRef.current, nextIndex, {
        playback: true,
        activeLayerId: activeLayerIdRef.current,
        debugCaller: "advancePlaybackFrames",
      });
      playAttachedSoundsForFrameIndices(visitedFrameIndices);

      return { didAdvance: true, shouldStopPlayback: false };
    },
    [playAttachedSoundsForFrameIndices, renderWorkspaceCanvases],
  );

  const handlePlayTimeline = useCallback(() => {
    const currentIndex = currentFrameIndexRef.current;
    saveCurrentFrameSnapshot(currentIndex, activeLayerIdRef.current, {
      debugCaller: "handlePlayTimeline",
      forceCapture: drawingCanvasRef.current?.hasPendingAuthoringChanges() ?? true,
    });
    drawingCanvasRef.current?.clearTransientEditingState();
    playbackReturnStateRef.current = {
      currentFrameIndex: currentIndex,
      selectedTimelineIndex: selectedTimelineIndexRef.current,
      activeLayerId: activeLayerIdRef.current,
    };
    motionTweenDebug("handlePlayTimeline:commit-then-clear", {
      layerId: activeLayerIdRef.current,
      currentFrameIndex: currentIndex,
    });
    const currentLayers = layersRef.current;
    stopTimelinePlaybackAudio();
    void ensureTimelinePlaybackAudioContext();
    const frameCount = getAuthoredPlaybackFrameCountForLayers(currentLayers);
    const clampedIndex = Math.max(0, Math.min(currentIndex, frameCount - 1));

    currentFrameIndexRef.current = clampedIndex;
    setCurrentFrameIndex(clampedIndex);
    selectedTimelineIndexRef.current = clampedIndex;
    setSelectedTimelineIndex(clampedIndex);
    playbackUiSyncAtRef.current = typeof performance !== "undefined" ? performance.now() : Date.now();

    const activeLayerFrames = getLayerById(currentLayers, activeLayerIdRef.current)?.timelineFrames ?? [];
    const activeTweenSpan = resolveTweenSpan(activeLayerFrames, clampedIndex);
    if (activeTweenSpan) {
      motionTweenDebug("handlePlayTimeline:active-tween-before-cache", {
        layerId: activeLayerIdRef.current,
        currentFrameIndex: clampedIndex,
        ownerIndex: activeTweenSpan.ownerIndex,
        stateId: activeTweenSpan.ownerFrame.stateId,
        spanStartIndex: activeTweenSpan.spanStartIndex,
        spanEndIndex: activeTweenSpan.spanEndIndex,
        ownerBitmap: summarizeBitmapForMotionTweenDebug(activeTweenSpan.ownerFrame.bitmap),
        tweenEndBitmap: summarizeBitmapForMotionTweenDebug(activeTweenSpan.ownerFrame.tweenEndBitmap),
        motionTween: summarizeMotionTweenForDebug(activeTweenSpan.ownerFrame.motionTween),
      });
    } else {
      motionTweenDebug("handlePlayTimeline:no-active-tween-span", {
        layerId: activeLayerIdRef.current,
        currentFrameIndex: clampedIndex,
      });
    }

    frozenTweenPlaybackCacheRef.current = buildFrozenTweenPlaybackCache(layersRef.current);
    invalidatePlaybackSurfaceMetrics();
    renderWorkspaceCanvases(layersRef.current, clampedIndex, {
      playback: true,
      activeLayerId: activeLayerIdRef.current,
      debugCaller: "handlePlayTimeline:start-playback",
      allowWhilePlaying: true,
    });
    playAttachedSoundsForFrameIndices([clampedIndex]);

    if (frameCount <= 1) {
      playbackUiSyncAtRef.current = 0;
      setIsTimelinePlaying(false);
      playbackReturnStateRef.current = null;
      stopTimelinePlaybackAudio();
      renderBitmapToPlaybackCanvas(null);
      window.requestAnimationFrame(() => {
        renderWorkspaceCanvases(layersRef.current, clampedIndex, {
          activeLayerId: activeLayerIdRef.current,
          debugCaller: "handlePlayTimeline:single-frame",
        });
      });
      return;
    }

    setIsTimelinePlaying(true);
  }, [ensureTimelinePlaybackAudioContext, invalidatePlaybackSurfaceMetrics, playAttachedSoundsForFrameIndices, renderBitmapToPlaybackCanvas, renderWorkspaceCanvases, saveCurrentFrameSnapshot, stopTimelinePlaybackAudio]);

  const handlePauseTimeline = useCallback(() => {
    frozenTweenPlaybackCacheRef.current = new Map();
    playbackRestorePendingRef.current = true;
    playbackUiSyncAtRef.current = 0;
    stopTimelinePlaybackAudio();
    setIsTimelinePlaying(false);
  }, [stopTimelinePlaybackAudio]);

  const handleTimelineFpsChange = useCallback((nextFps: number) => {
    setTimelineFps(Math.max(1, Math.min(55, nextFps)));
  }, []);

  const handleToggleOnion = useCallback(() => {
    setIsOnionEnabled((current) => !current);
  }, []);

  const commitCurrentFrameSnapshotWithoutHistory = useCallback(
    (debugCaller: string) => {
      if (isTimelinePlayingRef.current) {
        return;
      }

      if (!drawingCanvasRef.current?.hasPendingAuthoringChanges()) {
        return;
      }

      const previousHistoryApplyState = isApplyingHistoryRef.current;
      isApplyingHistoryRef.current = true;
      try {
        saveCurrentFrameSnapshot(currentFrameIndexRef.current, activeLayerIdRef.current, {
          captureOptions: { includePreviewUrl: false },
          debugCaller,
          forceCapture: true,
        });
      } finally {
        isApplyingHistoryRef.current = previousHistoryApplyState;
      }
    },
    [saveCurrentFrameSnapshot],
  );

  const syncCurrentWorkspaceForHistoryTraversal = useCallback(
    (direction: "undo" | "redo") => {
      commitCurrentFrameSnapshotWithoutHistory(`history:${direction}-commit-current-frame`);
      const localAvailability = getCurrentLocalDrawingHistoryAvailability();
      const hasLocalHistoryForDirection = direction === "undo" ? localAvailability.canUndo : localAvailability.canRedo;
      if (hasLocalHistoryForDirection) {
        syncHistoryAvailability();
        return false;
      }

      if (localAvailability.blocksGlobalTraversal) {
        syncHistoryAvailability();
        return false;
      }

      if (direction === "undo" && isCurrentWorkspaceStampedLocally()) {
        syncHistoryAvailability();
        return true;
      }

      const currentHistoryIndex = currentHistoryIndexRef.current;
      const currentEntry = currentHistoryIndex >= 0 ? historyEntriesRef.current[currentHistoryIndex] ?? null : null;
      const currentWorkspaceEntry = createHistoryEntryFromWorkspace();

      if (!currentEntry || historyEntriesMatchDocument(currentEntry, currentWorkspaceEntry)) {
        updateHistoryWorkspaceStamp();
        return true;
      }

      if (direction === "redo") {
        commitHistoryEntry(currentWorkspaceEntry, {
          skipCurrentEqualityCheck: true,
          skipFutureEqualityCheck: true,
        });
        updateHistoryWorkspaceStamp();
        syncHistoryAvailability();
        return false;
      }

      commitHistoryEntry(currentWorkspaceEntry, {
        skipFutureEqualityCheck: true,
      });
      updateHistoryWorkspaceStamp();
      return true;
    },
    [
      commitCurrentFrameSnapshotWithoutHistory,
      commitHistoryEntry,
      createHistoryEntryFromWorkspace,
      getCurrentLocalDrawingHistoryAvailability,
      isCurrentWorkspaceStampedLocally,
      syncHistoryAvailability,
      updateHistoryWorkspaceStamp,
    ],
  );

  const createPersistedProjectSnapshot = useCallback((): DrawingProjectData => {
    const snapshot = {
      version: 1,
      activeTool,
      brushSize,
      eraserSize,
      fillColor,
      timelineFps,
      shapeType,
      activeLayerId: activeLayerIdRef.current,
      currentFrameIndex: currentFrameIndexRef.current,
      selectedTimelineIndex: selectedTimelineIndexRef.current,
      isOnionEnabled,
      layers: layersRef.current.map((layer) => ({
        id: layer.id,
        name: layer.name,
        orderIndex: layer.orderIndex,
        timelineFrames: layer.timelineFrames.map(serializeTimelineFrame),
      })),
      nextTimelineFrameId: nextTimelineFrameIdRef.current,
      nextLayerNumber: nextLayerNumberRef.current,
    } satisfies DrawingProjectData;

    try {
      return structuredClone(snapshot);
    } catch {
      return JSON.parse(JSON.stringify(snapshot)) as DrawingProjectData;
    }
  }, [activeTool, brushSize, eraserSize, fillColor, isOnionEnabled, shapeType, timelineFps]);

  const handleUndo = useCallback(() => {
    if (isTimelinePlayingRef.current || isApplyingHistoryRef.current || !canUndoHistory) {
      return;
    }

    isApplyingHistoryRef.current = true;
    try {
      commitCurrentFrameSnapshotWithoutHistory("history:undo-commit-current-frame");
      const usedLocalHistory = applyLocalDrawingHistoryTraversal("undo");
      if (usedLocalHistory) {
        return;
      }
      if (!syncCurrentWorkspaceForHistoryTraversal("undo")) {
        return;
      }
      const previousHistoryIndex = findRelevantHistoryIndexForCurrentContext("undo");
      const previousEntry = previousHistoryIndex >= 0 ? historyEntriesRef.current[previousHistoryIndex] ?? null : null;
      if (!previousEntry) {
        return;
      }

      currentHistoryIndexRef.current = previousHistoryIndex;
      syncHistoryAvailability();
      restoreWorkspaceHistoryEntry(previousEntry, "undo");
    } finally {
      window.requestAnimationFrame(() => {
        isApplyingHistoryRef.current = false;
      });
    }
  }, [
    applyLocalDrawingHistoryTraversal,
    canUndoHistory,
    commitCurrentFrameSnapshotWithoutHistory,
    findRelevantHistoryIndexForCurrentContext,
    restoreWorkspaceHistoryEntry,
    syncCurrentWorkspaceForHistoryTraversal,
    syncHistoryAvailability,
  ]);

  const handleRedo = useCallback(() => {
    if (isTimelinePlayingRef.current || isApplyingHistoryRef.current || !canRedoHistory) {
      return;
    }

    isApplyingHistoryRef.current = true;
    try {
      commitCurrentFrameSnapshotWithoutHistory("history:redo-commit-current-frame");
      const usedLocalHistory = applyLocalDrawingHistoryTraversal("redo");
      if (usedLocalHistory) {
        return;
      }
      if (!syncCurrentWorkspaceForHistoryTraversal("redo")) {
        return;
      }
      const nextHistoryIndex = findRelevantHistoryIndexForCurrentContext("redo");
      const nextEntry = historyEntriesRef.current[nextHistoryIndex] ?? null;
      if (!nextEntry) {
        return;
      }

      currentHistoryIndexRef.current = nextHistoryIndex;
      syncHistoryAvailability();
      restoreWorkspaceHistoryEntry(nextEntry, "redo");
    } finally {
      window.requestAnimationFrame(() => {
        isApplyingHistoryRef.current = false;
      });
    }
  }, [
    applyLocalDrawingHistoryTraversal,
    canRedoHistory,
    commitCurrentFrameSnapshotWithoutHistory,
    findRelevantHistoryIndexForCurrentContext,
    restoreWorkspaceHistoryEntry,
    syncCurrentWorkspaceForHistoryTraversal,
    syncHistoryAvailability,
  ]);

  const addLayer = useCallback(() => {
    if (!isTimelinePlayingRef.current) {
      saveCurrentFrameSnapshot(currentFrameIndexRef.current, activeLayerIdRef.current, {
        debugCaller: "addLayer",
        forceCapture: drawingCanvasRef.current?.hasPendingAuthoringChanges() ?? true,
      });
    }

    const targetFrameIndex = Math.max(0, currentFrameIndexRef.current);
    const currentActiveLayerId = activeLayerIdRef.current;
    const currentSelectedTimelineIndex = selectedTimelineIndexRef.current;
    const activeLayerIndex = layersRef.current.findIndex((layer) => layer.id === activeLayerIdRef.current);
    const insertIndex = activeLayerIndex >= 0 ? activeLayerIndex + 1 : layersRef.current.length;
    const nextLayerId = `layer-${nextLayerNumberRef.current}`;
    const nextLayerName = `Layer ${nextLayerNumberRef.current}`;
    nextLayerNumberRef.current += 1;

    const nextLayerFrames: WorkspaceTimelineFrame[] = [];
    const keyframeId = nextTimelineFrameIdRef.current;
    nextTimelineFrameIdRef.current += 1;
    nextLayerFrames.push(
      createTimelineFrame(
        keyframeId,
        "keyframe",
        "blank-keyframe",
        keyframeId,
        { bitmap: null, previewUrl: null },
      ),
    );
    const nextLayers = normalizeLayerOrder([
      ...layersRef.current.slice(0, insertIndex),
      {
        id: nextLayerId,
        name: nextLayerName,
        orderIndex: insertIndex,
        timelineFrames: nextLayerFrames,
      },
      ...layersRef.current.slice(insertIndex),
    ]);

    layersRef.current = nextLayers;
    setLayers(nextLayers);
    const currentActiveLayer = getLayerById(nextLayers, currentActiveLayerId) ?? nextLayers[0] ?? null;
    if (currentActiveLayer) {
      activeLayerIdRef.current = currentActiveLayer.id;
      timelineFramesRef.current = currentActiveLayer.timelineFrames;
      setActiveLayerId(currentActiveLayer.id);
    }
    selectedTimelineIndexRef.current = currentSelectedTimelineIndex;
    setSelectedTimelineIndex(currentSelectedTimelineIndex);
    rebaseHistoryAfterLayerAddition(getLayerById(nextLayers, nextLayerId) ?? {
      id: nextLayerId,
      name: nextLayerName,
      orderIndex: insertIndex,
      timelineFrames: nextLayerFrames,
    }, {
      addedLayerIndex: insertIndex,
      nextActiveLayerId: currentActiveLayer?.id ?? currentActiveLayerId,
      nextCurrentFrameIndex: currentFrameIndexRef.current,
      nextSelectedTimelineIndex: currentSelectedTimelineIndex,
      nextTimelineFrameId: nextTimelineFrameIdRef.current,
      nextLayerNumber: nextLayerNumberRef.current,
    });
    updateHistoryWorkspaceStamp();

      window.requestAnimationFrame(() => {
        renderWorkspaceCanvases(nextLayers, targetFrameIndex, {
          activeLayerId: currentActiveLayer?.id ?? currentActiveLayerId,
          debugCaller: "addLayer",
        });
      });
  }, [
    rebaseHistoryAfterLayerAddition,
    renderWorkspaceCanvases,
    saveCurrentFrameSnapshot,
    updateHistoryWorkspaceStamp,
  ]);

  const deleteActiveLayer = useCallback(() => {
    const currentLayers = layersRef.current;
    if (currentLayers.length <= 1) {
      return;
    }

    const activeIndex = currentLayers.findIndex((layer) => layer.id === activeLayerIdRef.current);
    if (activeIndex < 0) {
      return;
    }

    if (!window.confirm("Delete the active layer?")) {
      return;
    }

    const deletedLayerId = activeLayerIdRef.current;

    if (!isTimelinePlayingRef.current) {
      saveCurrentFrameSnapshot(currentFrameIndexRef.current, deletedLayerId, {
        debugCaller: "deleteActiveLayer",
        forceCapture: drawingCanvasRef.current?.hasPendingAuthoringChanges() ?? true,
      });
    }

    const latestLayers = layersRef.current;
    const latestActiveIndex = latestLayers.findIndex((layer) => layer.id === activeLayerIdRef.current);
    if (latestLayers.length <= 1 || latestActiveIndex < 0) {
      return;
    }

    const nextLayers = normalizeLayerOrder(latestLayers.filter((_, index) => index !== latestActiveIndex));
    const nextActiveLayer = nextLayers[Math.min(latestActiveIndex, nextLayers.length - 1)] ?? nextLayers[0];
    if (!nextActiveLayer) {
      return;
    }

    layersRef.current = nextLayers;
    activeLayerIdRef.current = nextActiveLayer.id;
    timelineFramesRef.current = nextActiveLayer.timelineFrames;
    setLayers(nextLayers);
    setActiveLayerId(nextActiveLayer.id);
    rebaseHistoryAfterLayerDeletion(deletedLayerId, latestActiveIndex, {
      nextActiveLayerId: nextActiveLayer.id,
      nextCurrentFrameIndex: currentFrameIndexRef.current,
      nextSelectedTimelineIndex: selectedTimelineIndexRef.current,
    });
    updateHistoryWorkspaceStamp();

      window.requestAnimationFrame(() => {
        renderWorkspaceCanvases(nextLayers, currentFrameIndexRef.current, {
          playback: isTimelinePlayingRef.current,
          activeLayerId: nextActiveLayer.id,
          debugCaller: "deleteActiveLayer",
        });
      });
  }, [
    rebaseHistoryAfterLayerDeletion,
    renderWorkspaceCanvases,
    saveCurrentFrameSnapshot,
    updateHistoryWorkspaceStamp,
  ]);

  const addTimelineFrame = useCallback(
    (layerId: string, kind: TimelineFrameKind, targetIndex: number, options?: { blank?: boolean }) => {
      const currentIndex = currentFrameIndexRef.current;
      let liveSnapshot: TimelineFrameSnapshot | null = null;
      if (layerId !== activeLayerIdRef.current) {
        saveCurrentFrameSnapshot(currentIndex, activeLayerIdRef.current, {
          debugCaller: "addTimelineFrame:commit-active-layer",
          forceCapture: drawingCanvasRef.current?.hasPendingAuthoringChanges() ?? true,
        });
      } else {
        liveSnapshot = saveCurrentFrameSnapshot(currentIndex, layerId, {
          debugCaller: "addTimelineFrame:commit-target-layer",
          forceCapture: drawingCanvasRef.current?.hasPendingAuthoringChanges() ?? true,
        });
      }

      const existingFrames = getLayerById(layersRef.current, layerId)?.timelineFrames ?? [];
      if (!existingFrames.length) return;

      const targetSlotIndex = Math.max(0, targetIndex);
      const sourceSnapshot = options?.blank
        ? { bitmap: null, previewUrl: null }
        : resolveInsertionSourceSnapshot(layerId, existingFrames, targetSlotIndex, liveSnapshot);
      const sourceTextObjects = options?.blank
        ? EMPTY_DRAWING_TEXT_OBJECTS
        : resolveInsertionSourceTextObjects(layerId, existingFrames, targetSlotIndex);
      const insertionResult = applyTimelineFrameInsertion(existingFrames, kind, targetSlotIndex, sourceSnapshot, {
        blank: options?.blank,
        nextTimelineFrameId: nextTimelineFrameIdRef.current,
        sourceTextObjects,
      });
      const nextFrames = insertionResult.frames;
      const nextIndex = insertionResult.nextIndex;
      nextTimelineFrameIdRef.current = insertionResult.nextTimelineFrameId;

      const nextLayers = replaceLayerFrames(layerId, nextFrames);
      rebaseHistoryAfterFrameInsertion(layerId, kind, targetSlotIndex, {
        blank: options?.blank,
        nextActiveLayerId: layerId,
        nextCurrentFrameIndex: nextIndex,
        nextSelectedTimelineIndex: nextIndex,
        nextTimelineFrameId: insertionResult.nextTimelineFrameId,
      });
      activeLayerIdRef.current = layerId;
      setActiveLayerId(layerId);
      timelineFramesRef.current = nextFrames;
      currentFrameIndexRef.current = nextIndex;
      setCurrentFrameIndex(nextIndex);
      selectedTimelineIndexRef.current = nextIndex;
      setSelectedTimelineIndex(nextIndex);
      updateHistoryWorkspaceStamp();

      window.requestAnimationFrame(() => {
        renderWorkspaceCanvases(nextLayers, nextIndex, {
          activeLayerId: layerId,
          debugCaller: "addTimelineFrame",
        });
      });
    },
    [
      applyTimelineFrameInsertion,
      renderWorkspaceCanvases,
      rebaseHistoryAfterFrameInsertion,
      replaceLayerFrames,
      resolveInsertionSourceTextObjects,
      resolveInsertionSourceSnapshot,
      saveCurrentFrameSnapshot,
      updateHistoryWorkspaceStamp,
    ],
  );

  const removeTimelineFrame = useCallback(
    (layerId: string, targetIndex: number) => {
      if (layerId !== activeLayerIdRef.current) {
        saveCurrentFrameSnapshot(currentFrameIndexRef.current, activeLayerIdRef.current, {
          debugCaller: "removeTimelineFrame:commit-active-layer",
          forceCapture: drawingCanvasRef.current?.hasPendingAuthoringChanges() ?? true,
        });
      } else {
        saveCurrentFrameSnapshot(currentFrameIndexRef.current, layerId, {
          debugCaller: "removeTimelineFrame:commit-target-layer",
          forceCapture: drawingCanvasRef.current?.hasPendingAuthoringChanges() ?? true,
        });
      }

      const existingFrames = getLayerById(layersRef.current, layerId)?.timelineFrames ?? [];
      if (!existingFrames.length) return;

      const clampedTarget = Math.max(0, Math.min(targetIndex, existingFrames.length - 1));
      const removalResult = applyTimelineFrameRemoval(existingFrames, clampedTarget, {
        nextTimelineFrameId: nextTimelineFrameIdRef.current,
      });
      if (!removalResult) {
        return;
      }

      const {
        frames: collapsedFrames,
        removedFrameCount,
        removeStartIndex,
        removeEndIndex,
        nextTimelineFrameId,
      } = removalResult;
      nextTimelineFrameIdRef.current = nextTimelineFrameId;

      const currentIndex = currentFrameIndexRef.current;
      const nextIndex =
        currentIndex >= removeStartIndex && currentIndex <= removeEndIndex
          ? removeStartIndex
          : currentIndex > removeEndIndex
            ? currentIndex - removedFrameCount
            : currentIndex;
      const clampedNextIndex = Math.max(0, Math.min(nextIndex, collapsedFrames.length - 1));

      const nextLayers = replaceLayerFrames(layerId, collapsedFrames);
      activeLayerIdRef.current = layerId;
      setActiveLayerId(layerId);
      timelineFramesRef.current = collapsedFrames;
      currentFrameIndexRef.current = clampedNextIndex;
      setCurrentFrameIndex(clampedNextIndex);
      selectedTimelineIndexRef.current = Math.min(removeStartIndex, collapsedFrames.length - 1);
      setSelectedTimelineIndex(Math.min(removeStartIndex, collapsedFrames.length - 1));
      rebaseHistoryAfterFrameRemoval(layerId, clampedTarget, {
        nextActiveLayerId: layerId,
        nextCurrentFrameIndex: clampedNextIndex,
        nextSelectedTimelineIndex: Math.min(removeStartIndex, collapsedFrames.length - 1),
        nextTimelineFrameId,
      });
      updateHistoryWorkspaceStamp();

      window.requestAnimationFrame(() => {
        renderWorkspaceCanvases(nextLayers, clampedNextIndex, {
          activeLayerId: layerId,
          debugCaller: "removeTimelineFrame",
        });
      });
    },
    [
      applyTimelineFrameRemoval,
      rebaseHistoryAfterFrameRemoval,
      renderWorkspaceCanvases,
      replaceLayerFrames,
      saveCurrentFrameSnapshot,
      updateHistoryWorkspaceStamp,
    ],
  );

  const resizeTimelineSpan = useCallback(
    (layerId: string, stateId: number, spanType: "frame" | "tween", nextEndIndex: number) => {
      const currentIndex = currentFrameIndexRef.current;
      const resizeSessionKey = `${layerId}:${stateId}:${spanType}`;
      if (resizeCommitSessionRef.current?.key !== resizeSessionKey) {
        if (resizeCommitSessionRef.current) {
          motionTweenDebug("resizeTimelineSpan:resize-session-end", {
            sessionKey: resizeCommitSessionRef.current.key,
            reason: "session-key-changed",
          });
        }

        resizeCommitSessionRef.current = { key: resizeSessionKey };
        motionTweenDebug("resizeTimelineSpan:resize-session-start", {
          sessionKey: resizeSessionKey,
          layerId,
          stateId,
          spanType,
          nextEndIndex,
        });

        if (layerId !== activeLayerIdRef.current) {
          saveCurrentFrameSnapshot(currentIndex, activeLayerIdRef.current, {
            captureOptions: { includePreviewUrl: false },
            debugCaller: "resizeTimelineSpan:initial-commit-active-layer",
            forceCapture: drawingCanvasRef.current?.hasPendingAuthoringChanges() ?? true,
          });
        } else {
          saveCurrentFrameSnapshot(currentIndex, layerId, {
            captureOptions: { includePreviewUrl: false },
            debugCaller: "resizeTimelineSpan:initial-commit-resize-layer",
            forceCapture: drawingCanvasRef.current?.hasPendingAuthoringChanges() ?? true,
          });
        }
      } else {
        motionTweenDebug("resizeTimelineSpan:resize-session-skip-save", {
          sessionKey: resizeSessionKey,
          layerId,
          stateId,
          spanType,
          nextEndIndex,
        });
      }

      const existingFrames = getLayerById(layersRef.current, layerId)?.timelineFrames ?? [];
      if (!existingFrames.length) return;

      const targetLength = Math.max(0, nextEndIndex);
      const nextFrames = ensureTimelineLength(existingFrames, targetLength);
      const resizeResult = resizeTimelineSpanCells(nextFrames, stateId, spanType, nextEndIndex, nextTimelineFrameIdRef);
      if (!resizeResult) return;

      cleanupTweenEndpointForState(nextFrames, stateId);

      const { spanEndIndex, previousEndIndex, removedFrameCount, removedStartIndex } = resizeResult;
      const currentTimelineIndex = currentFrameIndexRef.current;
      const nextCurrentIndex =
        removedFrameCount > 0
          ? currentTimelineIndex >= removedStartIndex && currentTimelineIndex <= previousEndIndex
            ? spanEndIndex
            : currentTimelineIndex > previousEndIndex
              ? currentTimelineIndex - removedFrameCount
              : currentTimelineIndex
          : currentTimelineIndex;

      const nextLayers = replaceLayerFrames(layerId, nextFrames);
      activeLayerIdRef.current = layerId;
      setActiveLayerId(layerId);
      timelineFramesRef.current = nextFrames;
      currentFrameIndexRef.current = nextCurrentIndex;
      setCurrentFrameIndex(nextCurrentIndex);
      selectedTimelineIndexRef.current = spanEndIndex;
      setSelectedTimelineIndex(spanEndIndex);
      rebaseHistoryAfterTimelineSpanResize(layerId, stateId, spanType, nextEndIndex, {
        nextActiveLayerId: layerId,
        nextCurrentFrameIndex: nextCurrentIndex,
        nextSelectedTimelineIndex: spanEndIndex,
        nextTimelineFrameId: nextTimelineFrameIdRef.current,
      });
      updateHistoryWorkspaceStamp();

      window.requestAnimationFrame(() => {
        renderWorkspaceCanvases(nextLayers, nextCurrentIndex, {
          activeLayerId: layerId,
          debugCaller: "resizeTimelineSpan",
        });
      });
    },
    [
      ensureTimelineLength,
      rebaseHistoryAfterTimelineSpanResize,
      renderWorkspaceCanvases,
      replaceLayerFrames,
      saveCurrentFrameSnapshot,
      updateHistoryWorkspaceStamp,
    ],
  );

  useLayoutEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      renderWorkspaceCanvases(layersRef.current, currentFrameIndexRef.current, {
        activeLayerId: activeLayerIdRef.current,
        debugCaller: "useLayoutEffect:initial-render",
      });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [renderWorkspaceCanvases]);

  useEffect(() => {
    if (isTimelinePlaying) {
      return;
    }

    let frameId = 0;
    if (playbackRestorePendingRef.current) {
      playbackRestorePendingRef.current = false;
      restorePrePlaybackEditState();
      frameId = window.requestAnimationFrame(() => {
        renderWorkspaceCanvases(layersRef.current, currentFrameIndexRef.current, {
          activeLayerId: activeLayerIdRef.current,
          debugCaller: "useEffect:paused-restore-render",
        });
      });
      return () => window.cancelAnimationFrame(frameId);
    }

    frameId = window.requestAnimationFrame(() => {
      renderWorkspaceCanvases(layersRef.current, currentFrameIndexRef.current, {
        activeLayerId: activeLayerIdRef.current,
        debugCaller: "useEffect:paused-render-sync",
      });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [activeLayerId, currentFrameIndex, isTimelinePlaying, layers, renderWorkspaceCanvases, restorePrePlaybackEditState]);

  useEffect(() => {
    if (!isTimelinePlaying) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      invalidatePlaybackSurfaceMetrics();
      renderWorkspaceCanvases(layersRef.current, currentFrameIndexRef.current, {
        playback: true,
        activeLayerId: activeLayerIdRef.current,
        debugCaller: "useEffect:playback-surface-sync",
        allowWhilePlaying: true,
      });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [invalidatePlaybackSurfaceMetrics, isTimelinePlaying, renderWorkspaceCanvases]);

  useEffect(() => {
    const maxAuthoredIndex = Math.max(0, authoredPlaybackFrameCount - 1);
    const shouldStopPlayback = authoredPlaybackFrameCount <= 1 && isTimelinePlayingRef.current;
    const shouldClampCurrentFrame = currentFrameIndexRef.current > maxAuthoredIndex;
    const shouldClampSelectedFrame = selectedTimelineIndexRef.current > maxAuthoredIndex;

    if (shouldClampCurrentFrame) {
      currentFrameIndexRef.current = maxAuthoredIndex;
      setCurrentFrameIndex(maxAuthoredIndex);
    }

    if (shouldClampSelectedFrame) {
      selectedTimelineIndexRef.current = maxAuthoredIndex;
      setSelectedTimelineIndex(maxAuthoredIndex);
    }

    if (shouldStopPlayback) {
      playbackRestorePendingRef.current = true;
      playbackUiSyncAtRef.current = 0;
      stopTimelinePlaybackAudio();
      setIsTimelinePlaying(false);
    }

    if (shouldClampCurrentFrame || shouldStopPlayback) {
      window.requestAnimationFrame(() => {
        if (shouldStopPlayback) {
          renderBitmapToPlaybackCanvas(null);
          return;
        }

        renderWorkspaceCanvases(layersRef.current, currentFrameIndexRef.current, {
          playback: isTimelinePlayingRef.current,
          activeLayerId: activeLayerIdRef.current,
          debugCaller: "useEffect:authored-playback-clamp",
          allowWhilePlaying: false,
        });
      });
    }
  }, [authoredPlaybackFrameCount, renderBitmapToPlaybackCanvas, renderWorkspaceCanvases, stopTimelinePlaybackAudio]);

  useEffect(
    () => () => {
      stopTimelinePlaybackAudio();
      timelinePlaybackAudioTemplateRef.current.clear();
      timelinePlaybackAudioBufferRef.current.clear();
      if (timelinePlaybackAudioContextRef.current && timelinePlaybackAudioContextRef.current.state !== "closed") {
        void timelinePlaybackAudioContextRef.current.close().catch(() => {});
      }
      timelinePlaybackAudioContextRef.current = null;
    },
    [stopTimelinePlaybackAudio],
  );

  useEffect(() => {
    if (!isTimelinePlaying || authoredPlaybackFrameCount <= 1) return;

    const frameDurationMs = getClampedPlaybackFrameDurationMs(timelineFps);
    let rafId = 0;
    let lastStepTime = 0;
    let accumulatorMs = 0;

    const stepPlayback = (timestamp: number) => {
      if (!isTimelinePlayingRef.current) {
        return;
      }

      if (lastStepTime === 0) {
        lastStepTime = timestamp;
        rafId = window.requestAnimationFrame(stepPlayback);
        return;
      }

      const { accumulatorMs: nextAccumulatorMs, steps, droppedSteps } = advancePlaybackAccumulator(
        accumulatorMs,
        timestamp - lastStepTime,
        frameDurationMs,
      );

      accumulatorMs = nextAccumulatorMs;
      lastStepTime = timestamp;

      if (steps > 0) {
        const syncUiState = shouldSyncPlaybackUiState({
          lastUiSyncTimestampMs: playbackUiSyncAtRef.current,
          nextTimestampMs: timestamp,
          steps,
          droppedSteps,
        });
        if (syncUiState) {
          playbackUiSyncAtRef.current = timestamp;
        }
        if (droppedSteps > 0) {
          aiPlaybackDebug("playback:dropped-steps", {
            droppedSteps,
            frameDurationMs,
            timelineFps,
            authoredPlaybackFrameCount,
          });
        }
        const { shouldStopPlayback } = advancePlaybackFrames(steps, {
          syncUiState,
        });
        if (shouldStopPlayback) {
          playbackRestorePendingRef.current = true;
          playbackUiSyncAtRef.current = 0;
          setIsTimelinePlaying(false);
          stopTimelinePlaybackAudio();
          renderBitmapToPlaybackCanvas(null);
          return;
        }
      }

      rafId = window.requestAnimationFrame(stepPlayback);
    };

    rafId = window.requestAnimationFrame(stepPlayback);

    return () => window.cancelAnimationFrame(rafId);
  }, [advancePlaybackFrames, authoredPlaybackFrameCount, isTimelinePlaying, renderBitmapToPlaybackCanvas, renderWorkspaceCanvases, stopTimelinePlaybackAudio, timelineFps]);

  const createProjectPreview = useCallback(() => {
    try {
      const previewCanvas = document.createElement("canvas");
      previewCanvas.width = PROJECT_PREVIEW_WIDTH;
      previewCanvas.height = PROJECT_PREVIEW_HEIGHT;
      const previewCtx = previewCanvas.getContext("2d");
      if (!previewCtx) {
        return null;
      }

      previewCtx.fillStyle = "#ffffff";
      previewCtx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
      previewCtx.imageSmoothingEnabled = true;
      previewCtx.imageSmoothingQuality = "high";

      const stageBitmaps = [...layersRef.current]
        .reverse()
        .map((layer) => resolveTimelineBitmap(layer.timelineFrames, currentFrameIndexRef.current))
        .filter((bitmap): bitmap is ImageData => Boolean(bitmap));

      if (stageBitmaps.length === 0) {
        return exportProjectPreviewDataUrl(previewCanvas);
      }

      const [referenceBitmap] = stageBitmaps;
      const stageWidth = referenceBitmap.width;
      const stageHeight = referenceBitmap.height;
      let contentBounds: BitmapBounds | null = null;

      for (const bitmap of stageBitmaps) {
        contentBounds = mergeBitmapBounds(contentBounds, findOpaqueBitmapBounds(bitmap));
      }

      const paddedBounds = contentBounds
        ? padBitmapBounds(
            contentBounds,
            stageWidth,
            stageHeight,
            Math.max(6, Math.round(Math.max(contentBounds.width, contentBounds.height) * 0.08)),
          )
        : {
            left: 0,
            top: 0,
            width: stageWidth,
            height: stageHeight,
          };

      const scale = Math.min(
        previewCanvas.width / paddedBounds.width,
        previewCanvas.height / paddedBounds.height,
      );
      const targetWidth = Math.max(1, Math.round(paddedBounds.width * scale));
      const targetHeight = Math.max(1, Math.round(paddedBounds.height * scale));
      const targetLeft = Math.floor((previewCanvas.width - targetWidth) / 2);
      const targetTop = Math.floor((previewCanvas.height - targetHeight) / 2);
      const compositeCanvas = document.createElement("canvas");
      compositeCanvas.width = paddedBounds.width;
      compositeCanvas.height = paddedBounds.height;
      const compositeCtx = compositeCanvas.getContext("2d");
      if (!compositeCtx) {
        return exportProjectPreviewDataUrl(previewCanvas);
      }

      compositeCtx.clearRect(0, 0, compositeCanvas.width, compositeCanvas.height);

      for (const bitmap of stageBitmaps) {
        const sourceCanvas = createBitmapCanvas(bitmap);
        if (!sourceCanvas) {
          continue;
        }

        compositeCtx.drawImage(
          sourceCanvas,
          paddedBounds.left,
          paddedBounds.top,
          paddedBounds.width,
          paddedBounds.height,
          0,
          0,
          paddedBounds.width,
          paddedBounds.height,
        );
      }

      const smoothedCompositeCanvas = downscaleCanvasForPreview(compositeCanvas, targetWidth, targetHeight);
      previewCtx.drawImage(smoothedCompositeCanvas, targetLeft, targetTop, targetWidth, targetHeight);

      return exportProjectPreviewDataUrl(previewCanvas);
    } catch {
      return null;
    }
  }, []);

  const persistProject = useCallback(
    (options?: {
      forceNew?: boolean;
      nameOverride?: string;
      commitMode?: "snapshot" | "commitWithoutHistory";
    }) => {
      if (isTimelinePlayingRef.current) {
        return null;
      }

      if (options?.commitMode === "commitWithoutHistory") {
        commitCurrentFrameSnapshotWithoutHistory("file-menu-save-as-commit-current-frame");
      } else {
        saveCurrentFrameSnapshot(currentFrameIndexRef.current, activeLayerIdRef.current, {
          captureOptions: { includePreviewUrl: false },
          debugCaller: options?.forceNew ? "file-menu-save-as" : "file-menu-save",
        });
      }

      const nextProjectData = createPersistedProjectSnapshot();
      const nextProjectPreviewDataUrl = createProjectPreview();

      const savedProject = saveStoredDrawingProject({
        id: options?.forceNew ? null : projectId,
        name: options?.nameOverride ?? projectTitle,
        previewDataUrl: nextProjectPreviewDataUrl,
        data: nextProjectData,
        aiMemory: projectAiMemory,
      });

      setProjectId(savedProject.id);
      setProjectTitle(savedProject.name);
      setProjectAiMemory(savedProject.aiMemory ?? null);
      showSaveNotification(savedProject.name);
      return savedProject;
    },
    [
      commitCurrentFrameSnapshotWithoutHistory,
      createPersistedProjectSnapshot,
      createProjectPreview,
      projectAiMemory,
      projectId,
      projectTitle,
      saveCurrentFrameSnapshot,
      showSaveNotification,
    ],
  );

  const saveProject = useCallback(() => {
    persistProject();
  }, [persistProject]);

  const exportCurrentFrame = useCallback(() => {
    if (isTimelinePlayingRef.current) {
      return false;
    }

    saveCurrentFrameSnapshot(currentFrameIndexRef.current, activeLayerIdRef.current, {
      captureOptions: { includePreviewUrl: false },
      debugCaller: "ai:export-current-frame",
    });

    const stageBitmaps = [...layersRef.current]
      .reverse()
      .map((layer) => resolveTimelineBitmap(layer.timelineFrames, currentFrameIndexRef.current))
      .filter((bitmap): bitmap is ImageData => Boolean(bitmap));
    const referenceBitmap = stageBitmaps[0] ?? null;
    if (!referenceBitmap) {
      return false;
    }

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = referenceBitmap.width;
    exportCanvas.height = referenceBitmap.height;
    const exportCtx = exportCanvas.getContext("2d");
    if (!exportCtx) {
      return false;
    }

    exportCtx.fillStyle = "#ffffff";
    exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

    for (const bitmap of stageBitmaps) {
      const sourceCanvas = createBitmapCanvas(bitmap);
      if (!sourceCanvas) {
        continue;
      }

      exportCtx.drawImage(sourceCanvas, 0, 0);
    }

    const downloadLink = document.createElement("a");
    const exportDataUrl = exportCanvasToDataUrl(exportCanvas, "image/png");
    if (!exportDataUrl) {
      return false;
    }

    downloadLink.href = exportDataUrl;
    downloadLink.download = `${projectTitle.trim().replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") || "drawing-project"}-frame-${currentFrameIndexRef.current + 1}.png`;
    downloadLink.style.display = "none";
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    return true;
  }, [projectTitle, saveCurrentFrameSnapshot]);

  const executeAiActionPlan = useCallback(
    async (actionPlan: NonNullable<DrawingAiActionPlan>) => {
      if (actionPlan.type !== "engine-command" || actionPlan.executionMode !== "execute-now") {
        return false;
      }

      if (actionPlan.action === "save-project") {
        return Boolean(persistProject());
      }

      if (actionPlan.action === "export-current-frame") {
        return exportCurrentFrame();
      }

      if (actionPlan.action === "attach-sound-option-to-frame" && actionPlan.soundOption && typeof actionPlan.frameIndex === "number") {
        return attachSoundOptionToFrame(activeLayerIdRef.current, actionPlan.frameIndex, actionPlan.soundOption);
      }

      return false;
    },
    [attachSoundOptionToFrame, exportCurrentFrame, persistProject],
  );

  const applyGeneratedFrameToWorkspace = useCallback(
    (result: GeneratedFrameRenderResult) => {
      if (!result.ok) {
        console.warn("Generated frame request is not supported by the local frame executor yet.", result.reason);
        return false;
      }

      const now = Date.now();
      if (isApplyingGeneratedFramesRef.current) {
        console.warn("Skipped overlapping generated frame apply request because frame insertion is already in progress.");
        return false;
      }
      if (now - lastGeneratedFrameApplyAtRef.current < FRAME_GENERATION_DEBOUNCE_MS) {
        console.warn("Skipped generated frame apply request because it arrived inside the debounce window.", {
          debounceMs: FRAME_GENERATION_DEBOUNCE_MS,
        });
        return false;
      }

      isApplyingGeneratedFramesRef.current = true;

      try {
        const applyStartMs = typeof performance !== "undefined" ? performance.now() : 0;
        const frameIndex = currentFrameIndexRef.current;

        const uncappedGeneratedFrames = result.frames.length > 0
          ? result.frames
          : [{ bitmap: result.bitmap, previewUrl: result.previewUrl, summary: result.summary }];
        const generatedFrames =
          uncappedGeneratedFrames.length > MAX_FRAMES_PER_REQUEST
            ? uncappedGeneratedFrames.slice(0, MAX_FRAMES_PER_REQUEST)
            : uncappedGeneratedFrames;

        if (uncappedGeneratedFrames.length > MAX_FRAMES_PER_REQUEST) {
          console.warn("Generated frame apply request exceeded MAX_FRAMES_PER_REQUEST and was truncated.", {
            generatedFrameCount: uncappedGeneratedFrames.length,
            maxFramesPerRequest: MAX_FRAMES_PER_REQUEST,
          });
        }

        if (generatedFrames.length === 0) {
          return false;
        }

        const createGeneratedLayer = (name: string, placement: "front" | "back"): WorkspaceLayer => {
          const nextLayerId = `layer-${nextLayerNumberRef.current}`;
          nextLayerNumberRef.current += 1;
          const keyframeId = nextTimelineFrameIdRef.current;
          nextTimelineFrameIdRef.current += 1;
          const createdLayer: WorkspaceLayer = {
            id: nextLayerId,
            name,
            orderIndex: placement === "front" ? 0 : layersRef.current.length,
            timelineFrames: [createTimelineFrame(keyframeId, "keyframe", "blank-keyframe", keyframeId)],
          };
          const nextLayers = normalizeLayerOrder(
            placement === "front" ? [createdLayer, ...layersRef.current] : [...layersRef.current, createdLayer],
          );
          layersRef.current = nextLayers;
          setLayers(nextLayers);
          return getLayerById(nextLayers, nextLayerId) ?? createdLayer;
        };

        const activateResolvedLayer = (layer: WorkspaceLayer) => {
          if (layer.id !== activeLayerIdRef.current && !isTimelinePlayingRef.current) {
            saveCurrentFrameSnapshot(currentFrameIndexRef.current, activeLayerIdRef.current);
          }

          activeLayerIdRef.current = layer.id;
          timelineFramesRef.current = layer.timelineFrames;
          setActiveLayerId(layer.id);
        };

        const resolveTargetLayer = () => {
          const currentLayers = layersRef.current;
          const activeLayer = getLayerById(currentLayers, activeLayerIdRef.current) ?? currentLayers[0] ?? null;
          const layerIntent = result.workspaceIntent?.targetLayerIntent ?? "active-layer";

          if (layerIntent === "background-layer") {
            return currentLayers.find((layer) => isBackgroundWorkspaceLayer(layer)) ?? createGeneratedLayer("Background", "back");
          }

          if (layerIntent === "action-layer") {
            if (activeLayer && !isBackgroundWorkspaceLayer(activeLayer)) {
              return activeLayer;
            }

            return currentLayers.find((layer) => !isBackgroundWorkspaceLayer(layer)) ?? createGeneratedLayer("Action", "front");
          }

          return activeLayer ?? createGeneratedLayer("Action", "front");
        };

        const targetLayer = resolveTargetLayer();
        if (!targetLayer) {
          return false;
        }

        activateResolvedLayer(targetLayer);

        if (result.workspaceIntent?.applySuggestedFps && typeof result.workspaceIntent.fpsSuggestion === "number") {
          const suggestedFps = resolveSafeGeneratedSequenceFps({
            suggestedFps: Math.max(1, Math.min(55, Math.round(result.workspaceIntent.fpsSuggestion))),
            generatedFrameCount: generatedFrames.length,
            totalLayerCount: layersRef.current.length,
            renderScaleDownApplied: result.diagnostics.renderScaleDownApplied,
            performanceProtectionTriggered: result.diagnostics.performanceProtectionTriggered,
          });
          setTimelineFps((currentFps) => (currentFps === suggestedFps ? currentFps : suggestedFps));
        }

        const layerId = targetLayer.id;
        const latestTargetLayer = getLayerById(layersRef.current, layerId) ?? targetLayer;
        const nextFrames = ensureTimelineLength(latestTargetLayer.timelineFrames, frameIndex + generatedFrames.length - 1);
        let didChange = false;
        let hasRecordedUndo = false;

        const applyGeneratedFrameAtOffset = (offset: number) => {
          const generatedFrame = generatedFrames[offset];
          const targetIndex = frameIndex + offset;
          const targetFrame = nextFrames[targetIndex];
          if (!generatedFrame || !targetFrame) {
            return;
          }

          const nextSnapshot = {
            bitmap: generatedFrame.bitmap,
            previewUrl: generatedFrame.previewUrl,
          };

          if (targetFrame.cellType === "empty") {
            if (!hasRecordedUndo) {
              recordUndoSnapshot();
              hasRecordedUndo = true;
            }

            nextFrames[targetIndex] = createTimelineFrame(
              targetFrame.id,
              "keyframe",
              "keyframe",
              targetFrame.id,
              nextSnapshot,
            );
            didChange = true;
            return;
          }

          const currentBitmap = targetFrame.bitmap ?? null;
          const didBitmapChange =
            currentBitmap !== nextSnapshot.bitmap ||
            (currentBitmap?.width ?? -1) !== (nextSnapshot.bitmap?.width ?? -1) ||
            (currentBitmap?.height ?? -1) !== (nextSnapshot.bitmap?.height ?? -1);
          const didPreviewChange = (targetFrame.previewUrl ?? null) !== (nextSnapshot.previewUrl ?? null);

          if (!didBitmapChange && !didPreviewChange) {
            return;
          }

          if (!hasRecordedUndo) {
            recordUndoSnapshot();
            hasRecordedUndo = true;
          }

          const nextCellType = targetFrame.cellType === "tween" ? "tween" : "keyframe";
          nextFrames[targetIndex] = {
            ...targetFrame,
            kind: nextCellType === "tween" ? "tween" : "keyframe",
            cellType: nextCellType,
            isBlank: false,
            bitmap: generatedFrame.bitmap,
            previewUrl: generatedFrame.previewUrl,
            motionTween: nextCellType === "tween" ? targetFrame.motionTween : null,
          };
          didChange = true;
        };

        for (let frameOffset = 0; frameOffset < generatedFrames.length; frameOffset += 1) {
          applyGeneratedFrameAtOffset(frameOffset);
        }

        if (!didChange) {
          return false;
        }

        const nextLayers = replaceLayerFrames(layerId, nextFrames);
        const resolvedAppliedLayer = getLayerById(nextLayers, layerId) ?? targetLayer;
        activeLayerIdRef.current = layerId;
        timelineFramesRef.current = resolvedAppliedLayer.timelineFrames;
        setActiveLayerId(layerId);
        drawingCanvasRef.current?.clearTransientEditingState();
        const renderCaller =
          generatedFrames.length > 1
            ? "ai:apply-generated-frame:sequence"
            : "ai:apply-generated-frame:single";
        const applyDurationMs = applyStartMs > 0 && typeof performance !== "undefined" ? performance.now() - applyStartMs : null;
        window.requestAnimationFrame(() => {
          const renderStartMs = typeof performance !== "undefined" ? performance.now() : 0;
          renderWorkspaceCanvases(nextLayers, frameIndex, {
            activeLayerId: layerId,
            debugCaller: renderCaller,
          });
          const renderDurationMs =
            renderStartMs > 0 && typeof performance !== "undefined" ? performance.now() - renderStartMs : null;
          aiPlaybackDebug("apply-generated-frame", {
            frameCount: generatedFrames.length,
            layerCount: nextLayers.length,
            renderCaller,
            applyDurationMs,
            renderDurationMs,
            renderScaleDownApplied: result.diagnostics.renderScaleDownApplied,
            performanceProtectionTriggered: result.diagnostics.performanceProtectionTriggered,
          });
        });
        commitCurrentHistoryState({ assumeChanged: true });
        lastGeneratedFrameApplyAtRef.current = Date.now();
        return true;
      } finally {
        isApplyingGeneratedFramesRef.current = false;
      }
    },
    [
      commitCurrentHistoryState,
      ensureTimelineLength,
      recordUndoSnapshot,
      renderWorkspaceCanvases,
      replaceLayerFrames,
      saveCurrentFrameSnapshot,
    ],
  );

  const handleSaveAs = useCallback(() => {
    if (isTimelinePlayingRef.current) {
      return;
    }

    const promptedProjectName = window.prompt("Save project as", projectTitle);
    if (promptedProjectName === null) {
      return;
    }

    const trimmedProjectName = promptedProjectName.trim();
    if (!trimmedProjectName) {
      return;
    }

    persistProject({
      forceNew: true,
      nameOverride: trimmedProjectName,
      commitMode: "commitWithoutHistory",
    });
  }, [persistProject, projectTitle]);

  const handleTextObjectsChange = useCallback((nextTextObjects: DrawingTextObject[]) => {
    return updateFrameTextObjects(currentFrameIndexRef.current, nextTextObjects, activeLayerIdRef.current);
  }, [updateFrameTextObjects]);

  const workspaceAiContext = useMemo<DrawingAiWorkspaceContext>(() => {
    const activeLayerForContext = activeLayer;
    const activeFrames = activeLayerForContext?.timelineFrames ?? EMPTY_TIMELINE_FRAMES;
    const currentFrame = activeFrames[currentFrameIndex] ?? null;
    const selectedFrame = activeFrames[selectedTimelineIndex] ?? null;
    const currentTweenEditContext = activeLayerForContext
      ? resolveTweenEditContext(activeFrames, currentFrameIndex, activeLayerForContext.id)
      : null;
    const currentBitmap = activeLayerForContext
      ? resolveTimelineBitmap(activeFrames, currentFrameIndex, { tweenEditContext: currentTweenEditContext })
      : null;
    const currentBounds = findOpaqueBitmapBounds(currentBitmap);
    const previousFilledFrameIndex = currentFrameIndex > 0 ? findPreviousFilledIndex(activeFrames, currentFrameIndex - 1) : -1;
    const nextFilledFrameIndex = findNextFilledIndex(activeFrames, currentFrameIndex + 1);
    const currentCanvas = getDrawingCanvas();
    const canvasWidth = currentCanvas?.width ?? currentBitmap?.width ?? 1600;
    const canvasHeight = currentCanvas?.height ?? currentBitmap?.height ?? 900;

    return {
      projectId,
      projectTitle,
      activeLayerId: activeLayerForContext?.id ?? activeLayerId,
      activeLayerName: activeLayerForContext?.name ?? "Layer",
      totalLayers: layers.length,
      activeTool,
      timelineFps,
      authoredFrameCount: authoredPlaybackFrameCount,
      currentFrameIndex,
      selectedTimelineIndex,
      currentFrameHasBitmap: Boolean(currentBounds),
      currentFrameBounds: currentBounds
        ? {
            left: currentBounds.left,
            top: currentBounds.top,
            width: currentBounds.width,
            height: currentBounds.height,
          }
        : null,
      previousFilledFrameIndex: previousFilledFrameIndex >= 0 ? previousFilledFrameIndex : null,
      nextFilledFrameIndex: nextFilledFrameIndex >= 0 ? nextFilledFrameIndex : null,
      currentFrameSound: currentFrame?.soundAttachment
        ? {
            title: currentFrame.soundAttachment.title,
            description: currentFrame.soundAttachment.description,
            timingFeel: currentFrame.soundAttachment.timingFeel,
            intensityFeel: currentFrame.soundAttachment.intensityFeel,
          }
        : null,
      selectedFrameSound: selectedFrame?.soundAttachment
        ? {
            title: selectedFrame.soundAttachment.title,
            description: selectedFrame.soundAttachment.description,
            timingFeel: selectedFrame.soundAttachment.timingFeel,
            intensityFeel: selectedFrame.soundAttachment.intensityFeel,
          }
        : null,
      hasOffCameraAuthoringArea: true,
      cameraAreaDescription:
        "The white stage is the playback camera area. The darker surrounding area is still valid drawable authoring space and can hold off-camera motion.",
      canvasWidth,
      canvasHeight,
    };
  }, [
    activeLayer,
    activeLayerId,
    activeTool,
    authoredPlaybackFrameCount,
    currentFrameIndex,
    getDrawingCanvas,
    layers.length,
    projectId,
    projectTitle,
    selectedTimelineIndex,
    timelineFps,
  ]);
  const deferredWorkspaceAiContext = useDeferredValue(workspaceAiContext);

  useEffect(() => {
    const root = workspaceAreaRef.current;
    if (!root || isTimelinePlaying) {
      return;
    }

    let autosaveIdleHandle: number | null = null;
    let autosaveTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
    let pointerIsDown = false;

    const clearQueuedAutosave = () => {
      if (autosaveIdleHandle !== null && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(autosaveIdleHandle);
        autosaveIdleHandle = null;
      }

      if (autosaveTimeoutHandle !== null) {
        clearTimeout(autosaveTimeoutHandle);
        autosaveTimeoutHandle = null;
      }
    };

    const runQueuedAutosave = () => {
      autosaveIdleHandle = null;
      autosaveTimeoutHandle = null;

      if (pointerIsDown) {
        queueAutosave();
        return;
      }

      if (isApplyingHistoryRef.current || suppressNextWorkspaceAutosaveRef.current) {
        suppressNextWorkspaceAutosaveRef.current = false;
        return;
      }

      const currentFrame = timelineFramesRef.current[currentFrameIndexRef.current];
      if (!currentFrame || currentFrame.cellType === "empty") {
        return;
      }

      if (!drawingCanvasRef.current?.hasPendingAuthoringChanges()) {
        return;
      }

      if (drawingCanvasRef.current?.shouldDeferAuthoringSnapshotCapture()) {
        queueAutosave();
        return;
      }

      saveCurrentFrameSnapshot(currentFrameIndexRef.current, activeLayerIdRef.current, {
        captureOptions: { includePreviewUrl: false, preferIncrementalBitmapCapture: true },
        debugCaller: "workspace:pointerup-autosave",
      });
    };

    const queueAutosave = () => {
      clearQueuedAutosave();

      if ("requestIdleCallback" in window) {
        autosaveIdleHandle = window.requestIdleCallback(runQueuedAutosave, {
          timeout: POINTERUP_AUTOSAVE_IDLE_TIMEOUT_MS,
        });
        return;
      }

      autosaveTimeoutHandle = setTimeout(runQueuedAutosave, POINTERUP_AUTOSAVE_IDLE_TIMEOUT_MS);
    };

    const handlePointerDown = () => {
      pointerIsDown = true;
      clearQueuedAutosave();
    };

    const handlePointerUp = () => {
      pointerIsDown = false;
      queueAutosave();
    };

    root.addEventListener("pointerdown", handlePointerDown);
    root.addEventListener("pointerup", handlePointerUp);
    root.addEventListener("pointercancel", handlePointerUp);

    return () => {
      pointerIsDown = false;
      clearQueuedAutosave();
      root.removeEventListener("pointerdown", handlePointerDown);
      root.removeEventListener("pointerup", handlePointerUp);
      root.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [isTimelinePlaying, saveCurrentFrameSnapshot]);

  const onionFramePreviews = useMemo(() => {
    if (!isOnionEnabled || isTimelinePlaying) {
      return {
        previous: EMPTY_ONION_FRAME_PREVIEW,
        next: EMPTY_ONION_FRAME_PREVIEW,
      };
    }

    const onionAnchorIndex = selectedTimelineIndex;
    const currentPreview = resolveOnionFramePreview(timelineFrames, onionAnchorIndex);
    const previousPreview = resolveOnionNeighborPreview(timelineFrames, onionAnchorIndex, "previous", currentPreview);
    const nextPreview = resolveOnionNeighborPreview(timelineFrames, onionAnchorIndex, "next", currentPreview);
    const shouldCollapseDuplicateNeighbors =
      onionFramePreviewHasContent(previousPreview) &&
      onionFramePreviewHasContent(nextPreview) &&
      onionFramePreviewsEqual(previousPreview, nextPreview);

    return {
      previous: previousPreview,
      next: shouldCollapseDuplicateNeighbors ? EMPTY_ONION_FRAME_PREVIEW : nextPreview,
    };
  }, [isOnionEnabled, isTimelinePlaying, selectedTimelineIndex, timelineFrames]);

  const previousFrameBitmap = onionFramePreviews.previous.bitmap;
  const nextFrameBitmap = onionFramePreviews.next.bitmap;
  const previousFrameTextObjects = onionFramePreviews.previous.textObjects;
  const nextFrameTextObjects = onionFramePreviews.next.textObjects;

  useLayoutEffect(() => {
    drawingCanvasRef.current?.setOnionOverlayContent({
      previousBitmap: previousFrameBitmap,
      nextBitmap: nextFrameBitmap,
      previousTextObjects: previousFrameTextObjects,
      nextTextObjects: nextFrameTextObjects,
    });
  }, [nextFrameBitmap, nextFrameTextObjects, previousFrameBitmap, previousFrameTextObjects]);

  const activeFrameTextObjects = useMemo(
    () => resolveTimelineTextObjects(timelineFrames, currentFrameIndex),
    [currentFrameIndex, timelineFrames],
  );
  const canEditTextInCurrentFrame = useMemo(() => {
    if (isTimelinePlaying || activeTweenEditContext?.side === "end") {
      return false;
    }

    const frame = timelineFrames[currentFrameIndex] ?? null;
    return Boolean(frame && frame.cellType !== "empty");
  }, [activeTweenEditContext, currentFrameIndex, isTimelinePlaying, timelineFrames]);

  const activeTweenGuide = useMemo((): TweenGuide | null => {
    if (isTimelinePlaying || activeTweenEditContext) {
      return null;
    }

    const focusIndexCandidates = [selectedTimelineIndex, currentFrameIndex];

    for (const focusIndex of focusIndexCandidates) {
      const segment = findTweenGuideSegment(timelineFrames, focusIndex);
      if (!segment) {
        continue;
      }

      const ownerFrame = timelineFrames[segment.ownerIndex];
      if (!ownerFrame?.bitmap || !ownerFrame.tweenEndBitmap) {
        continue;
      }

      const startBounds = findOpaqueBitmapBounds(ownerFrame.bitmap);
      const endBounds = findOpaqueBitmapBounds(ownerFrame.tweenEndBitmap);

      if (!startBounds || !endBounds) {
        continue;
      }

      return {
        startIndex: segment.startIndex,
        endIndex: segment.endIndex,
        stageWidth: ownerFrame.bitmap.width,
        stageHeight: ownerFrame.bitmap.height,
        startBounds,
        endBounds,
      };
    }

    return null;
  }, [activeTweenEditContext, currentFrameIndex, isTimelinePlaying, selectedTimelineIndex, timelineFrames]);

  useLayoutEffect(() => {
    if (!activeTweenGuide) {
      setCanvasOverlayRect(null);
      return;
    }

    let rafId = 0;
    const updateRect = () => {
      const nextStageRect = measureCanvasOverlayRect();
      setCanvasOverlayRect((previousRect) => (sameOverlayRect(previousRect, nextStageRect) ? previousRect : nextStageRect));
    };

    const loop = () => {
      updateRect();
      rafId = window.requestAnimationFrame(loop);
    };

    updateRect();
    rafId = window.requestAnimationFrame(loop);
    window.addEventListener("resize", updateRect);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", updateRect);
    };
  }, [activeTweenGuide, measureCanvasOverlayRect]);

  const tweenGuideOverlay = useMemo(() => {
    if (!canvasOverlayRect || !activeTweenGuide) {
      return null;
    }

    const scaleX = canvasOverlayRect.width / activeTweenGuide.stageWidth;
    const scaleY = canvasOverlayRect.height / activeTweenGuide.stageHeight;
    const startCenterX =
      canvasOverlayRect.left + (activeTweenGuide.startBounds.left + activeTweenGuide.startBounds.width / 2) * scaleX;
    const startCenterY =
      canvasOverlayRect.top + (activeTweenGuide.startBounds.top + activeTweenGuide.startBounds.height / 2) * scaleY;
    const endCenterX =
      canvasOverlayRect.left + (activeTweenGuide.endBounds.left + activeTweenGuide.endBounds.width / 2) * scaleX;
    const endCenterY =
      canvasOverlayRect.top + (activeTweenGuide.endBounds.top + activeTweenGuide.endBounds.height / 2) * scaleY;

    return {
      startCenterX,
      startCenterY,
      endCenterX,
      endCenterY,
      startRect: {
        left: canvasOverlayRect.left + activeTweenGuide.startBounds.left * scaleX,
        top: canvasOverlayRect.top + activeTweenGuide.startBounds.top * scaleY,
        width: activeTweenGuide.startBounds.width * scaleX,
        height: activeTweenGuide.startBounds.height * scaleY,
      },
      endRect: {
        left: canvasOverlayRect.left + activeTweenGuide.endBounds.left * scaleX,
        top: canvasOverlayRect.top + activeTweenGuide.endBounds.top * scaleY,
        width: activeTweenGuide.endBounds.width * scaleX,
        height: activeTweenGuide.endBounds.height * scaleY,
      },
    };
  }, [activeTweenGuide, canvasOverlayRect]);

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
      <DrawingTopBar
        projectTitle={projectTitle}
        onSave={saveProject}
        onSaveAs={handleSaveAs}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={!isTimelinePlaying && canUndoHistory}
        canRedo={!isTimelinePlaying && canRedoHistory}
      />
      {saveNotification && (
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            top: 14,
            left: "50%",
            transform: saveNotification.isVisible
              ? "translateX(-50%) translateY(0)"
              : "translateX(-50%) translateY(-14px)",
            opacity: saveNotification.isVisible ? 1 : 0,
            transition: "transform 220ms ease, opacity 180ms ease",
            padding: "12px 16px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(18,22,28,0.96)",
            boxShadow: "0 14px 34px rgba(0,0,0,0.30)",
            display: "flex",
            flexDirection: "column",
            gap: 4,
            pointerEvents: "none",
            zIndex: 40,
            minWidth: 220,
            textAlign: "center",
          }}
        >
          <div style={{ color: "rgba(255,255,255,0.94)", fontSize: 14, fontWeight: 700 }}>Project saved</div>
          <div style={{ color: "rgba(255,255,255,0.68)", fontSize: 12 }}>{saveNotification.projectName}</div>
        </div>
      )}
      <MemoizedDrawingTimelineRow
        fps={timelineFps}
        isPlaying={isTimelinePlaying}
        isOnionEnabled={isOnionEnabled}
        currentFrameIndex={currentFrameIndex}
        selectedTimelineIndex={selectedTimelineIndex}
        activeLayerId={activeLayerId}
        canPasteFrame={hasCopiedTimelineFrame}
        layers={timelineRowLayers}
        onFpsChange={handleTimelineFpsChange}
        onCurrentFrameChange={switchToFrame}
        onTimelinePositionSelect={selectTimelinePosition}
        onActiveLayerChange={activateLayer}
        onAddLayer={addLayer}
        onDeleteLayer={deleteActiveLayer}
        canDeleteLayer={layers.length > 1}
        onToggleOnion={handleToggleOnion}
        onPlay={handlePlayTimeline}
        onPause={handlePauseTimeline}
        onAddFrame={addTimelineFrame}
        onRemoveFrame={removeTimelineFrame}
        onCopyFrame={copyTimelineFrame}
        onPasteFrame={pasteTimelineFrame}
        onRemoveSoundAttachment={removeSoundAttachmentFromFrame}
        onResizeTimelineSpan={resizeTimelineSpan}
        onSoundOptionDrop={attachSoundOptionToFrame}
      />
      <div ref={workspaceAreaRef} style={{ flex: 1, minHeight: 0, position: "relative", display: "flex" }}>
        {isTimelinePlaying && (
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "auto",
              cursor: "default",
              background: "transparent",
              zIndex: PLAYBACK_INTERACTION_BLOCKER_Z_INDEX,
            }}
          />
        )}
        <MemoizedDrawingCanvas
          activeTool={activeTool}
          activeTextObjects={activeFrameTextObjects}
          brushSize={brushSize}
          canEditTextInCurrentFrame={canEditTextInCurrentFrame}
          editingContextKey={drawingEditingContextKey}
          eraserSize={eraserSize}
          fillColor={fillColor}
          isTimelinePlaying={isTimelinePlaying}
          onAuthoringActionCommitted={commitCanvasAuthoringAction}
          onToolSelect={setActiveTool}
          playbackRenderScale={isTimelinePlaying ? playbackRenderScale : 1}
          workspaceContext={deferredWorkspaceAiContext}
          projectAiMemory={projectAiMemory}
          onProjectAiMemoryChange={setProjectAiMemory}
          onApplyGeneratedFrame={applyGeneratedFrameToWorkspace}
          onExecuteActionPlan={executeAiActionPlan}
          ref={drawingCanvasRef}
          shapeType={shapeType}
          onBrushSizeChange={setBrushSize}
          onEraserSizeChange={setEraserSize}
          onFillColorChange={setFillColor}
          onShapeTypeChange={setShapeType}
          onTextObjectsChange={handleTextObjectsChange}
        />
        {tweenGuideOverlay && (
          <svg
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
              zIndex: 3,
              overflow: "visible",
            }}
          >
            <defs>
              <marker
                id="diamond-tween-arrow"
                markerWidth="9"
                markerHeight="9"
                refX="7"
                refY="4.5"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0,0 L9,4.5 L0,9 z" fill="rgba(78, 168, 255, 0.94)" />
              </marker>
            </defs>
            <rect
              x={tweenGuideOverlay.startRect.left}
              y={tweenGuideOverlay.startRect.top}
              width={tweenGuideOverlay.startRect.width}
              height={tweenGuideOverlay.startRect.height}
              fill="rgba(78, 168, 255, 0.06)"
              stroke="rgba(78, 168, 255, 0.55)"
              strokeDasharray="4 4"
            />
            <rect
              x={tweenGuideOverlay.endRect.left}
              y={tweenGuideOverlay.endRect.top}
              width={tweenGuideOverlay.endRect.width}
              height={tweenGuideOverlay.endRect.height}
              fill="rgba(78, 168, 255, 0.1)"
              stroke="rgba(78, 168, 255, 0.78)"
              strokeDasharray="4 4"
            />
            <line
              x1={tweenGuideOverlay.startCenterX}
              y1={tweenGuideOverlay.startCenterY}
              x2={tweenGuideOverlay.endCenterX}
              y2={tweenGuideOverlay.endCenterY}
              stroke="rgba(78, 168, 255, 0.94)"
              strokeWidth="2"
              strokeDasharray="8 6"
              markerEnd="url(#diamond-tween-arrow)"
            />
            <circle
              cx={tweenGuideOverlay.startCenterX}
              cy={tweenGuideOverlay.startCenterY}
              r="4"
              fill="rgba(18, 27, 38, 0.98)"
              stroke="rgba(78, 168, 255, 0.96)"
              strokeWidth="1.5"
            />
            <circle
              cx={tweenGuideOverlay.endCenterX}
              cy={tweenGuideOverlay.endCenterY}
              r="4"
              fill="rgba(78, 168, 255, 0.96)"
            />
          </svg>
        )}
      </div>
      <DrawingToolBar activeTool={activeTool} onToolSelect={setActiveTool} />
    </div>
  );
}
