import type { UnifiedAnimationDocumentV2, UnifiedCellV2 } from "./unifiedAnimationContractV2";
import type { UnifiedAnimationItemV2 } from "./unifiedAnimationContentV2";

export type UnifiedWorkspaceRootV2 = {
  document: UnifiedAnimationDocumentV2;
  undo: UnifiedAnimationDocumentV2[];
  redo: UnifiedAnimationDocumentV2[];
  dirty: boolean;
  generation: number;
};

export const createUnifiedWorkspaceRootV2 = (document: UnifiedAnimationDocumentV2): UnifiedWorkspaceRootV2 => ({ document: structuredClone(document), undo: [], redo: [], dirty: false, generation: 1 });

const commit = (root: UnifiedWorkspaceRootV2, change: (draft: UnifiedAnimationDocumentV2) => void): UnifiedWorkspaceRootV2 => {
  const draft = structuredClone(root.document);
  change(draft);
  if (JSON.stringify(draft) === JSON.stringify(root.document)) return root;
  return { document: draft, undo: [...root.undo, root.document], redo: [], dirty: true, generation: root.generation + 1 };
};

export const undoUnified = (root: UnifiedWorkspaceRootV2): UnifiedWorkspaceRootV2 => {
  const previous = root.undo.at(-1); if (!previous) return root;
  return { document: structuredClone(previous), undo: root.undo.slice(0, -1), redo: [root.document, ...root.redo], dirty: true, generation: root.generation + 1 };
};
export const redoUnified = (root: UnifiedWorkspaceRootV2): UnifiedWorkspaceRootV2 => {
  const next = root.redo[0]; if (!next) return root;
  return { document: structuredClone(next), undo: [...root.undo, root.document], redo: root.redo.slice(1), dirty: true, generation: root.generation + 1 };
};

export const resolveOwnerV2 = (document: UnifiedAnimationDocumentV2, layerId: string, index: number) => {
  const layer = document.layers.find(value => value.layerId === layerId); if (!layer) throw new Error("stale_target");
  const cell = layer.cells[index]; if (!cell || cell.cellType === "empty") return null;
  const owner = layer.cells.find(value => value.cellId === cell.ownerCellId); if (!owner?.content) throw new Error("invalid_cell_owner");
  return { layer, cell, owner };
};

const ensureOwner = (document: UnifiedAnimationDocumentV2, layerId: string, index: number) => {
  const layer = document.layers.find(value => value.layerId === layerId); if (!layer || layer.locked) throw new Error("stale_target");
  while (layer.cells.length <= index) layer.cells.push({ cellId: crypto.randomUUID(), cellType: "empty", ownerCellId: null, content: null });
  let cell = layer.cells[index];
  if (cell.cellType === "empty") {
    cell = { cellId: cell.cellId, cellType: "keyframe", ownerCellId: cell.cellId, content: { items: [], soundAttachment: null } };
    layer.cells[index] = cell;
  }
  const owner = layer.cells.find(value => value.cellId === cell.ownerCellId);
  if (!owner?.content) throw new Error("invalid_cell_owner");
  return owner;
};

export const addOrReplaceItem = (root: UnifiedWorkspaceRootV2, layerId: string, index: number, item: UnifiedAnimationItemV2) => commit(root, document => {
  const owner = ensureOwner(document, layerId, index);
  const at = owner.content!.items.findIndex(value => value.itemId === item.itemId);
  if (at < 0) owner.content!.items.push(structuredClone(item)); else owner.content!.items[at] = structuredClone(item);
});

export const removeItem = (root: UnifiedWorkspaceRootV2, layerId: string, index: number, itemId: string) => commit(root, document => {
  const resolved = resolveOwnerV2(document, layerId, index); if (!resolved || resolved.layer.locked) return;
  resolved.owner.content!.items = resolved.owner.content!.items.filter(item => item.itemId !== itemId);
});

export const addNeutralLayer = (root: UnifiedWorkspaceRootV2) => commit(root, document => {
  const layerId = crypto.randomUUID(), cellId = crypto.randomUUID();
  document.layers.push({ layerId, name: `Layer ${document.layers.length + 1}`, orderIndex: document.layers.length, visible: true, locked: false,
    cells: [{ cellId, cellType: "blank-keyframe", ownerCellId: cellId, content: { items: [], soundAttachment: null } }] });
  document.reopenState.activeLayerId = layerId;
});

export const insertMixedKeyframe = (root: UnifiedWorkspaceRootV2, layerId: string, index: number) => commit(root, document => {
  const layer = document.layers.find(value => value.layerId === layerId); if (!layer || layer.locked) return;
  const source = index > 0 ? resolveOwnerV2(document, layerId, index - 1)?.owner.content : null;
  const content = source ? structuredClone(source) : { items: [], soundAttachment: null };
  content.items = content.items.map(item => ({ ...item, itemId: crypto.randomUUID() }));
  const cell: UnifiedCellV2 = { cellId: crypto.randomUUID(), cellType: "keyframe", ownerCellId: "", content };
  cell.ownerCellId = cell.cellId;
  layer.cells.splice(index, 0, cell);
});

export const insertHold = (root: UnifiedWorkspaceRootV2, layerId: string, index: number) => commit(root, document => {
  const layer = document.layers.find(value => value.layerId === layerId); if (!layer || layer.locked || index < 1) return;
  const previous = resolveOwnerV2(document, layerId, index - 1); if (!previous) return;
  layer.cells.splice(index, 0, { cellId: crypto.randomUUID(), cellType: "hold", ownerCellId: previous.owner.cellId, content: null });
});

export const blankCell = (root: UnifiedWorkspaceRootV2, layerId: string, index: number) => commit(root, document => {
  const layer = document.layers.find(value => value.layerId === layerId); if (!layer || layer.locked) return;
  const cellId = layer.cells[index]?.cellId ?? crypto.randomUUID();
  layer.cells[index] = { cellId, cellType: "blank-keyframe", ownerCellId: cellId, content: { items: [], soundAttachment: null } };
});

export const pasteMixedCell = (root: UnifiedWorkspaceRootV2, layerId: string, index: number, content: NonNullable<UnifiedCellV2["content"]>) => commit(root, document => {
  const layer = document.layers.find(value => value.layerId === layerId); if (!layer || layer.locked) return;
  const cloned = structuredClone(content); cloned.items = cloned.items.map(item => ({ ...item, itemId: crypto.randomUUID() }));
  const cellId = layer.cells[index]?.cellId ?? crypto.randomUUID();
  layer.cells[index] = { cellId, cellType: "keyframe", ownerCellId: cellId, content: cloned };
});

export const setReopenState = (root: UnifiedWorkspaceRootV2, layerId: string, index: number, onion?: boolean): UnifiedWorkspaceRootV2 => ({
  ...root, document: { ...root.document, reopenState: { activeLayerId: layerId, currentFrameIndex: index, onionEnabled: onion ?? root.document.reopenState.onionEnabled } },
});
