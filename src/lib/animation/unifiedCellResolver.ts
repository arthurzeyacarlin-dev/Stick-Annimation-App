import type { UnifiedAnimationDocumentV1, UnifiedAnimationLayerV1, UnifiedAnimationCellV1 } from "./unifiedAnimationContract.ts";

export type ResolvedUnifiedCell = { layer: UnifiedAnimationLayerV1; cell: UnifiedAnimationCellV1; owner: UnifiedAnimationCellV1; progress: number | null };

export function resolveUnifiedCell(layer: UnifiedAnimationLayerV1, index: number): ResolvedUnifiedCell | null {
  if (!Number.isInteger(index) || index < 0) throw new Error("invalid_render_index");
  const cell = layer.cells[index];
  if (!cell || cell.cellType === "empty") return null;
  const ownerIndex = layer.cells.findIndex(candidate => candidate.cellId === cell.ownerCellId);
  const owner = layer.cells[ownerIndex];
  if (!owner || ownerIndex > index || owner.ownerCellId !== owner.cellId || owner.payload === null || !["keyframe", "blank-keyframe", "tween"].includes(owner.cellType)) throw new Error("invalid_cell_owner");
  if (owner.cellType === "blank-keyframe") return null;
  let progress: number | null = null;
  if (owner.cellType === "tween" || cell.cellType === "tween") {
    if (layer.contentKind !== "drawing/v1") throw new Error("invalid_render_command");
    let start = index, end = index;
    while (start > 0 && layer.cells[start - 1].ownerCellId === owner.cellId) start--;
    while (end + 1 < layer.cells.length && layer.cells[end + 1].ownerCellId === owner.cellId) end++;
    // Preserve Drawing's existing position-only playback sample convention.
    progress = (index - start + 1) / (end - start + 2);
  }
  return { layer, cell, owner, progress };
}

export function resolveUnifiedRenderList(document: UnifiedAnimationDocumentV1, index: number): ResolvedUnifiedCell[] {
  if (!Number.isInteger(index) || index < 0) throw new Error("invalid_render_index");
  const ordered = [...document.layers].sort((a, b) => a.orderIndex - b.orderIndex);
  if (new Set(ordered.map(l => l.orderIndex)).size !== ordered.length) throw new Error("invalid_layer_order");
  return ordered.filter(layer => layer.visible).flatMap(layer => {
    const resolved = resolveUnifiedCell(layer, index);
    return resolved ? [resolved] : [];
  });
}
