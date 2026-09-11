import assert from "node:assert/strict";

export const assertNeutralOwnerOracle = (value: unknown) => {
  const project = value as { document: { layers: Array<{ contentKind?: unknown; cells: Array<{ ownerCellId: string | null; cellId: string; content: { items: Array<{ kind: string }> } | null }> }> } };
  const layer = project.document.layers[0];
  assert.equal("contentKind" in layer, false);
  const owner = layer.cells[0];
  assert.equal(owner.ownerCellId, owner.cellId);
  assert.deepEqual(owner.content?.items.map(item => item.kind), ["drawing-raster/v1", "drawing-text/v1", "stick-rig/v1", "symbol-instance/v1"]);
  return { layers: project.document.layers.length, itemKinds: owner.content!.items.map(item => item.kind) };
};
