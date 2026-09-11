import type { UnifiedAnimationMigrationCandidateV1 } from "./unifiedAnimationContract";
import type { UnifiedAnimationProjectV2, UnifiedCellV2, UnifiedLayerV2 } from "./unifiedAnimationContractV2";
import type { UnifiedAnimationItemV2 } from "./unifiedAnimationContentV2";

// Read-only compatibility upgrade. It never writes either legacy source store.
export function upgradeUnifiedProjectV1ToV2(candidate: UnifiedAnimationMigrationCandidateV1): UnifiedAnimationProjectV2 {
  const stableUuid = (key: string) => {
    let a = 0x811c9dc5, b = 0x9e3779b9, c = 0x85ebca6b, d = 0xc2b2ae35;
    for (let index = 0; index < key.length; index += 1) {
      const code = key.charCodeAt(index);
      a = Math.imul(a ^ code, 0x01000193);
      b = Math.imul(b ^ code, 0x27d4eb2d);
      c = Math.imul(c ^ code, 0x165667b1);
      d = Math.imul(d ^ code, 0x9e3779b1);
    }
    const hex = [a, b, c, d].map(value => (value >>> 0).toString(16).padStart(8, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  };
  const layers: UnifiedLayerV2[] = candidate.project.document.layers.map((layer, orderIndex) => ({
    layerId: layer.layerId, name: layer.name, orderIndex, visible: layer.visible, locked: layer.locked,
    cells: layer.cells.map((cell): UnifiedCellV2 => {
      if (cell.cellType === "empty") return { cellId: cell.cellId, cellType: "empty", ownerCellId: null, content: null };
      if (cell.ownerCellId !== cell.cellId) return { cellId: cell.cellId, cellType: cell.cellType, ownerCellId: cell.ownerCellId, content: null };
      const items: UnifiedAnimationItemV2[] = [];
      if (layer.contentKind === "drawing/v1" && cell.payload) {
        const payload = cell.payload as import("./unifiedAnimationContract").UnifiedDrawingCellPayloadV1;
        if (payload.bitmapAssetId) items.push({ itemId: stableUuid(`${candidate.project.projectId}:${layer.layerId}:${cell.cellId}:raster`), kind: "drawing-raster/v1", strokes: [], shapes: [] });
        for (const [textIndex, text] of payload.textObjects.entries()) items.push({ itemId: stableUuid(`${candidate.project.projectId}:${layer.layerId}:${cell.cellId}:text:${textIndex}`), kind: "drawing-text/v1", text: text.text, x: text.x, y: text.y, color: text.color, fontSize: text.fontSize, rotation: text.rotation, width: text.width, flipX: text.flipX, flipY: text.flipY, fontFamily: text.fontFamily, bold: text.bold, italic: text.italic });
      } else if (layer.contentKind === "stick-rig/v1" && cell.payload) items.push({ itemId: stableUuid(`${candidate.project.projectId}:${layer.layerId}:${cell.cellId}:stick`), kind: "stick-rig/v1", content: structuredClone(cell.payload as import("../../components/workspace/stickfigure/types").StickFigureFrameContent) });
      return { cellId: cell.cellId, cellType: cell.cellType, ownerCellId: cell.cellId, content: { items, soundAttachment: null } };
    }),
  }));
  return {
    kind: "diamond-animation-project", schemaVersion: 2, projectId: candidate.project.projectId, title: candidate.project.title,
    createdAt: candidate.project.createdAt, updatedAt: candidate.project.updatedAt, revision: 0,
    document: { kind: "diamond-animation-document", schemaVersion: 2, projectId: candidate.project.projectId,
      logicalStage: candidate.project.document.logicalStage, fps: candidate.project.document.fps, layers, catalogs: { symbols: [], assets: [] },
      toolState: { drawingTool: candidate.project.document.drawingState?.activeTool ?? "Select", stickTool: "idle" },
      reopenState: { activeLayerId: candidate.project.document.reopenState.activeLayerId, currentFrameIndex: candidate.project.document.reopenState.currentFrameIndex, onionEnabled: candidate.project.document.reopenState.onionEnabled } },
  };
}
