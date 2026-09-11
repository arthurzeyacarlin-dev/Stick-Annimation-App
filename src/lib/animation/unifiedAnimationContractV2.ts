import type { UnifiedCellContentV2 } from "./unifiedAnimationContentV2";

export type UnifiedCellV2 = {
  cellId: string;
  cellType: "empty" | "keyframe" | "blank-keyframe" | "hold" | "tween";
  ownerCellId: string | null;
  content: UnifiedCellContentV2 | null;
};

export type UnifiedLayerV2 = {
  layerId: string;
  name: string;
  orderIndex: number;
  visible: boolean;
  locked: boolean;
  cells: UnifiedCellV2[];
};

export type UnifiedAnimationDocumentV2 = {
  kind: "diamond-animation-document";
  schemaVersion: 2;
  projectId: string;
  logicalStage: { width: 1920; height: 1080; origin: "top-left"; xAxis: "right"; yAxis: "down" };
  fps: number;
  layers: UnifiedLayerV2[];
  catalogs: { symbols: []; assets: [] };
  toolState: { drawingTool: string; stickTool: string };
  reopenState: { activeLayerId: string; currentFrameIndex: number; onionEnabled: boolean };
};

export type UnifiedAnimationProjectV2 = {
  kind: "diamond-animation-project";
  schemaVersion: 2;
  projectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  document: UnifiedAnimationDocumentV2;
  compatibility?: { drawingData: unknown; stickByCell: Record<string, import("../../components/workspace/stickfigure/types").StickFigureFrameContent> };
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const finite = (value: number) => Number.isFinite(value) && !Object.is(value, -0);

export function assertUnifiedAnimationDocumentV2(document: UnifiedAnimationDocumentV2) {
  if (document.kind !== "diamond-animation-document" || document.schemaVersion !== 2 || !uuid.test(document.projectId)) throw new Error("invalid_record");
  if (!Number.isInteger(document.fps) || document.fps < 1 || document.fps > 55) throw new Error("invalid_record");
  if (document.layers.length < 1 || document.layers.length > 64) throw new Error("invalid_record");
  const layerIds = new Set<string>();
  const itemIds = new Set<string>();
  for (const [order, layer] of document.layers.entries()) {
    if (!uuid.test(layer.layerId) || layerIds.has(layer.layerId) || layer.orderIndex !== order || !layer.name.trim() || "contentKind" in layer) throw new Error("invalid_record");
    layerIds.add(layer.layerId);
    if (layer.cells.length < 1 || layer.cells.length > 10_000) throw new Error("invalid_record");
    const cellIds = new Set(layer.cells.map(cell => cell.cellId));
    for (const [index, cell] of layer.cells.entries()) {
      if (!uuid.test(cell.cellId)) throw new Error("invalid_record");
      if (cell.cellType === "empty") { if (cell.ownerCellId !== null || cell.content !== null) throw new Error("invalid_cell_owner"); continue; }
      const ownerIndex = layer.cells.findIndex(candidate => candidate.cellId === cell.ownerCellId);
      if (ownerIndex < 0 || ownerIndex > index) throw new Error("invalid_cell_owner");
      if (cell.ownerCellId === cell.cellId) {
        if (!cell.content) throw new Error("invalid_cell_owner");
        for (const item of cell.content.items) {
          if (!uuid.test(item.itemId) || itemIds.has(`${layer.layerId}:${cell.cellId}:${item.itemId}`)) throw new Error("invalid_record");
          itemIds.add(`${layer.layerId}:${cell.cellId}:${item.itemId}`);
          if (item.kind === "drawing-raster/v1") {
            for (const stroke of item.strokes) for (const point of stroke.points) if (!finite(point.x) || !finite(point.y)) throw new Error("invalid_record");
          } else if (item.kind === "drawing-text/v1") {
            if (!finite(item.x) || !finite(item.y) || !finite(item.fontSize)) throw new Error("invalid_record");
          } else if (item.kind === "stick-rig/v1") {
            const jointIds = new Set(item.content.structureGraph.joints.map(joint => joint.id));
            if (jointIds.size !== item.content.structureGraph.joints.length || item.content.structureGraph.limbs.some(limb => !jointIds.has(limb.startJointId) || !jointIds.has(limb.endJointId))) throw new Error("invalid_record");
          } else if (item.kind !== "symbol-instance/v1") throw new Error("invalid_record");
        }
      } else if (cell.content !== null || !cellIds.has(cell.ownerCellId!)) throw new Error("invalid_cell_owner");
    }
  }
  if (!layerIds.has(document.reopenState.activeLayerId)) throw new Error("invalid_record");
  return document;
}

export function assertUnifiedAnimationProjectV2(project: UnifiedAnimationProjectV2) {
  if (project.kind !== "diamond-animation-project" || project.schemaVersion !== 2 || project.projectId !== project.document.projectId || !uuid.test(project.projectId)) throw new Error("invalid_record");
  assertUnifiedAnimationDocumentV2(project.document);
  return project;
}
