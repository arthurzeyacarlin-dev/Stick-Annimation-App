import type { StickFigureFrameContent } from "../../components/workspace/stickfigure/types";

export type UnifiedPointV2 = { x: number; y: number };
export type UnifiedStrokeV2 = { id: string; color: string; width: number; points: UnifiedPointV2[] };
export type UnifiedShapeV2 = { id: string; color: string; width: number; shape: "line" | "rectangle" | "ellipse"; from: UnifiedPointV2; to: UnifiedPointV2 };

export type UnifiedDrawingRasterItemV2 = {
  itemId: string;
  kind: "drawing-raster/v1";
  strokes: UnifiedStrokeV2[];
  shapes: UnifiedShapeV2[];
  bitmap?: {
    width: number;
    height: number;
    data: Uint8ClampedArray;
    x?: number;
    y?: number;
    stageWidth?: number;
    stageHeight?: number;
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
export type UnifiedCellContentV2 = { items: UnifiedAnimationItemV2[]; soundAttachment: null };

export const cloneUnifiedCellContentV2 = (content: UnifiedCellContentV2): UnifiedCellContentV2 => structuredClone(content);
