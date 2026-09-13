import type { StickFigureFrameContent } from "../../components/workspace/stickfigure/types";

export type UnifiedPointV2 = { x: number; y: number };
export type UnifiedStrokeV2 = { id: string; color: string; width: number; points: UnifiedPointV2[] };
export type UnifiedShapeV2 = { id: string; color: string; width: number; shape: "line" | "rectangle" | "ellipse"; from: UnifiedPointV2; to: UnifiedPointV2 };

export type UnifiedRasterBitmapV2 = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  x?: number;
  y?: number;
  stageWidth?: number;
  stageHeight?: number;
};

export type UnifiedDrawingMotionTweenV2 = {
  mode: "position";
  stageWidth: number;
  stageHeight: number;
  spriteBitmap: UnifiedRasterBitmapV2 | null;
  startOrigin: { x: number; y: number } | null;
  endOrigin: { x: number; y: number } | null;
};

export type UnifiedDrawingSoundAttachmentV2 = {
  id: string;
  title: string;
  description: string;
  timingFeel: string | null;
  intensityFeel: string | null;
  audioDataUrl?: string | null;
  contentType?: "sfx" | "voice-placeholder" | null;
  speechText?: string | null;
  sourceTask: "generate-sounds";
  attachedAt: string;
};

export type UnifiedDrawingRasterItemV2 = {
  itemId: string;
  kind: "drawing-raster/v1";
  strokes: UnifiedStrokeV2[];
  shapes: UnifiedShapeV2[];
  bitmap?: UnifiedRasterBitmapV2 | null;
  tweenEndBitmap?: UnifiedRasterBitmapV2 | null;
  motionTween?: UnifiedDrawingMotionTweenV2 | null;
  sourceTransform?: {
    sourceWidth: number;
    sourceHeight: number;
    targetWidth: 1920;
    targetHeight: 1080;
    scale: number;
    offsetX: number;
    offsetY: number;
  } | null;
};

export type UnifiedDrawingTextItemV2 = {
  itemId: string;
  kind: "drawing-text/v1";
  text: string;
  x: number;
  y: number;
  color: string;
  fontSize: number;
  rotation: number;
  width: number;
  flipX: boolean;
  flipY: boolean;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
};

export type UnifiedStickRigItemV2 = {
  itemId: string;
  kind: "stick-rig/v1";
  content: StickFigureFrameContent;
};

export type UnifiedSymbolSourceCategoryV2 =
  | "Drawing Symbol"
  | "Stick Figure Symbol"
  | "Drawing and Stick Figure Symbol";

export type UnifiedSymbolInstanceItemV2 = {
  itemId: string;
  kind: "symbol-instance/v1";
  definitionId: string;
  definitionDigest: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
};

export type UnifiedAnimationItemV2 = UnifiedDrawingRasterItemV2 | UnifiedDrawingTextItemV2 | UnifiedStickRigItemV2 | UnifiedSymbolInstanceItemV2;
export type UnifiedCellContentV2 = {
  items: UnifiedAnimationItemV2[];
  soundAttachment: UnifiedDrawingSoundAttachmentV2 | null;
  dormantSourceContent?: unknown | null;
};

export const cloneUnifiedCellContentV2 = (content: UnifiedCellContentV2): UnifiedCellContentV2 => structuredClone(content);
