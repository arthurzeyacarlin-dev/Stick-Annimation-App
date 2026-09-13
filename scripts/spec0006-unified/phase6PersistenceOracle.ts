import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { UnifiedAnimationProjectV2 } from "../../src/lib/animation/unifiedAnimationContractV2.ts";

const sha = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");

export const independentPhase6Inventory = (project: UnifiedAnimationProjectV2) => {
  const bitmaps: { path: string; digest: string; byteLength: number }[] = [];
  const visit = (value: unknown, path: string) => {
    if (value instanceof Uint8Array || value instanceof Uint8ClampedArray) {
      const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      bitmaps.push({ path, digest: sha(bytes), byteLength: bytes.byteLength });
      return;
    }
    if (Array.isArray(value)) value.forEach((entry, index) => visit(entry, `${path}[${index}]`));
    else if (value && typeof value === "object") Object.entries(value).forEach(([key, entry]) => visit(entry, `${path}.${key}`));
  };
  visit(project, "project");
  const owners = project.document.layers.flatMap(layer => layer.cells.filter(cell => cell.ownerCellId === cell.cellId && cell.content));
  const items = owners.flatMap(cell => cell.content!.items);
  return {
    projectId: project.projectId,
    title: project.title,
    revision: project.revision,
    layers: project.document.layers.length,
    cells: project.document.layers.reduce((total, layer) => total + layer.cells.length, 0),
    itemKinds: items.map(item => item.kind).sort(),
    itemIds: items.map(item => item.itemId).sort(),
    bitmapBindings: bitmaps.sort((left, right) => left.path.localeCompare(right.path)),
    symbolBindings: project.document.catalogs.symbols.map(symbol => ({ id: symbol.definitionId, asset: symbol.assetSha256, digest: symbol.definitionDigest })).sort((a, b) => a.id.localeCompare(b.id)),
    soundDigests: owners.map(cell => cell.content!.soundAttachment?.audioDataUrl ?? null).filter((value): value is string => Boolean(value)).map(value => sha(value)).sort(),
    stickGeometry: items.filter(item => item.kind === "stick-rig/v1").map(item => item.kind === "stick-rig/v1" ? sha(JSON.stringify(item.content)) : ""),
  };
};

export const assertPhase6PayloadRetained = (
  before: UnifiedAnimationProjectV2,
  after: UnifiedAnimationProjectV2,
  options: { identityMayChange?: boolean; titleMayChange?: boolean } = {},
) => {
  const left = independentPhase6Inventory(before);
  const right = independentPhase6Inventory(after);
  if (options.identityMayChange) { right.projectId = left.projectId; }
  if (options.titleMayChange) { right.title = left.title; }
  right.revision = left.revision;
  assert.deepEqual(right, left);
};

export const rawStoreDigest = (value: string | null) => sha(value ?? "<absent>");
