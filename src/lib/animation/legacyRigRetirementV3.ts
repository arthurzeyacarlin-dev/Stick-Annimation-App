import type { StickFigureFrameContent } from "../../components/workspace/stickfigure/types.ts";
import type { UnifiedAnimationItemV2, UnifiedDrawingRasterItemV2, UnifiedRasterBitmapV2 } from "./unifiedAnimationContentV2.ts";
import {
  assertDrawingOnlyUnifiedProjectV2,
  assertUnifiedAnimationProjectV2,
  type UnifiedAnimationProjectV2,
} from "./unifiedAnimationContractV2.ts";
import { assertStructuredSymbolDigestsV2, createBitmapSymbolDefinitionV2 } from "./unifiedProjectCatalogV2.ts";

export const LEGACY_RIG_RETIREMENT_VERSION = 3 as const;
export const LEGACY_RIG_RENDERER_VERSION = "legacy-rig-raster/v1" as const;
export const LEGACY_RIG_CANONICAL_WIDTH = 4563;
export const LEGACY_RIG_CANONICAL_HEIGHT = 3302;

type RetirementSourceKind = NonNullable<UnifiedAnimationProjectV2["auxiliary"]>["rigRetirementReceipt"] extends infer Receipt
  ? Receipt extends { sourceKind: infer Kind } ? Kind : never
  : never;

type RetirementOptions = {
  sourceKind: RetirementSourceKind;
  sourceDigest: string;
};

const AUTHORING_WORLD_SCALE = 4.6;
const MAX_RASTER_BYTES = 268_435_456;

const digestBytes = async (bytes: Uint8Array) => {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
};

const stableContentDigest = async (value: unknown): Promise<string> => {
  const seen = new Set<object>();
  const visit = async (entry: unknown): Promise<unknown> => {
    if (ArrayBuffer.isView(entry)) {
      const view = entry as Uint8Array | Uint8ClampedArray;
      return { typedArray: entry instanceof Uint8ClampedArray ? "Uint8ClampedArray" : "Uint8Array", byteLength: view.byteLength, sha256: await digestBytes(new Uint8Array(view.buffer, view.byteOffset, view.byteLength)) };
    }
    if (entry === null || typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean") return entry;
    if (entry === undefined || typeof entry !== "object" || seen.has(entry as object)) throw new Error("rig_migration_digest_failed");
    seen.add(entry as object);
    const result = Array.isArray(entry)
      ? await Promise.all(entry.map(visit))
      : Object.fromEntries(await Promise.all(Object.entries(entry as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(async ([key, child]) => [key, await visit(child)] as const)));
    seen.delete(entry as object);
    return result;
  };
  return digestBytes(new TextEncoder().encode(JSON.stringify(await visit(value))));
};

const makeCanvas = (width: number, height: number) => {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width * height * 4 > MAX_RASTER_BYTES) throw new Error("project_too_large");
  const canvas = typeof OffscreenCanvas === "function"
    ? new OffscreenCanvas(width, height)
    : typeof document !== "undefined"
      ? Object.assign(document.createElement("canvas"), { width, height })
      : null;
  const context = canvas?.getContext("2d", { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (!canvas || !context) throw new Error("rig_migration_renderer_unavailable");
  return { canvas, context };
};

const authoringStageTransform = (width: number, height: number) => {
  const viewportWidth = width / AUTHORING_WORLD_SCALE;
  const viewportHeight = height / AUTHORING_WORLD_SCALE;
  const scale = Math.min(viewportWidth / 1920, viewportHeight / 1080);
  return {
    scale,
    x: (width - viewportWidth) / 2 + (viewportWidth - 1920 * scale) / 2,
    y: (height - viewportHeight) / 2 + (viewportHeight - 1080 * scale) / 2,
  };
};

const putRaster = (context: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D, bitmap: UnifiedRasterBitmapV2 | null | undefined) => {
  if (!bitmap) return;
  const source = makeCanvas(bitmap.width, bitmap.height);
  source.context.putImageData(new ImageData(bitmap.data.slice(), bitmap.width, bitmap.height), 0, 0);
  context.drawImage(source.canvas, bitmap.x ?? 0, bitmap.y ?? 0);
};

const drawLegacyRig = (
  context: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  content: StickFigureFrameContent,
  width: number,
  height: number,
) => {
  const transform = authoringStageTransform(width, height);
  const graph = content.structureGraph;
  const joints = new Map(graph.joints.map(joint => [joint.id, joint]));
  context.save();
  context.translate(transform.x, transform.y);
  context.scale(transform.scale, transform.scale);
  context.strokeStyle = "#101218";
  context.fillStyle = "#101218";
  context.lineWidth = 14;
  context.lineCap = "round";
  context.lineJoin = "round";
  for (const limb of graph.limbs) {
    const start = joints.get(limb.startJointId);
    const end = joints.get(limb.endJointId);
    if (!start || !end) throw new Error("invalid_record");
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
  }
  for (const joint of graph.joints) {
    context.beginPath();
    context.arc(joint.x, joint.y, 14, 0, Math.PI * 2);
    context.fill();
  }
  for (const figure of content.figures) {
    context.save();
    const figureWidth = Math.max(42, figure.scale * 0.55);
    const figureHeight = Math.max(72, figure.scale);
    const scale = Math.min(figureWidth / 64, figureHeight / 120);
    context.translate(960 + figure.x, 540 + figure.y);
    context.rotate(figure.rotation * Math.PI / 180);
    context.scale(scale, scale);
    context.translate(-32, -60);
    context.lineWidth = 4;
    context.beginPath(); context.arc(32, 18, 12, 0, Math.PI * 2); context.stroke();
    for (const [x1, y1, x2, y2] of [[32, 30, 32, 70], [12, 48, 52, 48], [32, 70, 12, 106], [32, 70, 52, 106]]) {
      context.beginPath(); context.moveTo(x1, y1); context.lineTo(x2, y2); context.stroke();
    }
    context.restore();
  }
  context.restore();
};

const bitmapDimensions = (items: UnifiedAnimationItemV2[]) => {
  const raster = items.find((item): item is UnifiedDrawingRasterItemV2 => item.kind === "drawing-raster/v1" && Boolean(item.bitmap));
  return {
    width: raster?.bitmap?.stageWidth ?? raster?.bitmap?.width ?? LEGACY_RIG_CANONICAL_WIDTH,
    height: raster?.bitmap?.stageHeight ?? raster?.bitmap?.height ?? LEGACY_RIG_CANONICAL_HEIGHT,
  };
};

const migrateOwnerItems = (items: UnifiedAnimationItemV2[]) => {
  const rigItems = items.filter(item => item.kind === "stick-rig/v1");
  if (!rigItems.length) return { items, convertedItemIds: [] as string[] };
  const { width, height } = bitmapDimensions(items);
  const { context } = makeCanvas(width, height);
  const firstRasterIndex = items.findIndex(item => item.kind === "drawing-raster/v1");
  const firstRigIndex = items.findIndex(item => item.kind === "stick-rig/v1");
  const targetIndex = firstRasterIndex >= 0 ? Math.min(firstRasterIndex, firstRigIndex) : firstRigIndex;
  for (const item of items) {
    if (item.kind === "drawing-raster/v1") putRaster(context, item.bitmap);
    else if (item.kind === "stick-rig/v1") drawLegacyRig(context, item.content, width, height);
  }
  const pixels = context.getImageData(0, 0, width, height).data.slice();
  const existingRaster = firstRasterIndex >= 0 ? items[firstRasterIndex] as UnifiedDrawingRasterItemV2 : null;
  const replacement: UnifiedDrawingRasterItemV2 = {
    itemId: existingRaster?.itemId ?? rigItems[0].itemId,
    kind: "drawing-raster/v1",
    strokes: structuredClone(existingRaster?.strokes ?? []),
    shapes: structuredClone(existingRaster?.shapes ?? []),
    bitmap: {
      width,
      height,
      data: pixels,
      x: 0,
      y: 0,
      stageWidth: width,
      stageHeight: height,
      ...(existingRaster?.bitmap?.paintCoverage ? { paintCoverage: structuredClone(existingRaster.bitmap.paintCoverage) } : {}),
    },
    tweenEndBitmap: structuredClone(existingRaster?.tweenEndBitmap ?? null),
    motionTween: structuredClone(existingRaster?.motionTween ?? null),
    sourceTransform: structuredClone(existingRaster?.sourceTransform ?? null),
  };
  const migrated: UnifiedAnimationItemV2[] = [];
  items.forEach((item, index) => {
    if (index === targetIndex) migrated.push(replacement);
    if (item.kind !== "stick-rig/v1" && item.kind !== "drawing-raster/v1") migrated.push(structuredClone(item));
  });
  return { items: migrated, convertedItemIds: rigItems.map(item => item.itemId) };
};

const hasRetiredContent = (project: UnifiedAnimationProjectV2) =>
  project.document.layers.some(layer => layer.cells.some(cell => cell.content?.items.some(item => item.kind === "stick-rig/v1"))) ||
  project.document.catalogs.symbols.some(definition => Boolean(definition.structuredPayload)) ||
  Object.keys(project.compatibility?.stickByCell ?? {}).length > 0;

export async function retireLegacyRigsV3(project: UnifiedAnimationProjectV2, options: RetirementOptions) {
  assertUnifiedAnimationProjectV2(project);
  await assertStructuredSymbolDigestsV2(project.document.catalogs.symbols);
  if (!hasRetiredContent(project)) return project;
  const candidate = structuredClone(project);
  const convertedOwnerCellIds: string[] = [];
  const convertedItemIds: string[] = [];
  for (const layer of candidate.document.layers) for (const cell of layer.cells) {
    if (!cell.content) continue;
    const migrated = migrateOwnerItems(cell.content.items);
    if (migrated.convertedItemIds.length) {
      cell.content.items = migrated.items;
      convertedOwnerCellIds.push(cell.cellId);
      convertedItemIds.push(...migrated.convertedItemIds);
    }
    const dormant = cell.content.dormantSourceContent;
    if (dormant && typeof dormant === "object" && Array.isArray((dormant as { items?: unknown }).items)) {
      const dormantItems = (dormant as { items: UnifiedAnimationItemV2[] }).items;
      const migratedDormant = migrateOwnerItems(dormantItems);
      (dormant as { items: UnifiedAnimationItemV2[] }).items = migratedDormant.items;
      convertedItemIds.push(...migratedDormant.convertedItemIds);
    }
  }
  const convertedDefinitionIds: string[] = [];
  const digestByDefinition = new Map<string, string>();
  candidate.document.catalogs.symbols = await Promise.all(candidate.document.catalogs.symbols.map(async definition => {
    if (!definition.structuredPayload) return definition;
    convertedDefinitionIds.push(definition.definitionId);
    const replacement = await createBitmapSymbolDefinitionV2({
      definitionId: definition.definitionId,
      name: definition.name,
      sourceCategory: definition.sourceCategory === "Stick Figure Symbol" ? "Drawing Symbol" : "Mixed Symbol",
      width: definition.width,
      height: definition.height,
      pngDataUrl: definition.pngDataUrl,
    });
    digestByDefinition.set(replacement.definitionId, replacement.definitionDigest);
    return replacement;
  }));
  for (const layer of candidate.document.layers) for (const cell of layer.cells) for (const item of cell.content?.items ?? []) {
    if (item.kind === "symbol-instance/v1" && digestByDefinition.has(item.definitionId)) item.definitionDigest = digestByDefinition.get(item.definitionId)!;
  }
  if (candidate.compatibility) {
    candidate.compatibility.stickByCell = {};
    for (const instances of Object.values(candidate.compatibility.symbolInstancesByCell ?? {})) for (const instance of instances) {
      if (digestByDefinition.has(instance.definitionId)) instance.definitionDigest = digestByDefinition.get(instance.definitionId)!;
    }
  }
  if (!candidate.auxiliary) candidate.auxiliary = { drawingAiMemory: null, stickAiCreationLatch: null };
  delete candidate.auxiliary.rigRetirementReceipt;
  const outputContentDigest = await stableContentDigest(candidate);
  candidate.auxiliary.rigRetirementReceipt = {
    version: LEGACY_RIG_RETIREMENT_VERSION,
    rendererVersion: LEGACY_RIG_RENDERER_VERSION,
    sourceKind: options.sourceKind,
    sourceProjectId: project.projectId,
    sourceRevision: project.revision,
    sourceDigest: options.sourceDigest,
    convertedOwnerCellIds: [...new Set(convertedOwnerCellIds)].sort(),
    convertedItemIds: [...new Set(convertedItemIds)].sort(),
    convertedDefinitionIds: [...new Set(convertedDefinitionIds)].sort(),
    outputContentDigest,
    recovery: {
      kind: options.sourceKind === "unified-v2" ? "immutable-version" : "legacy-source",
      projectId: project.projectId,
      revision: project.revision,
      digest: options.sourceDigest,
    },
  };
  return assertDrawingOnlyUnifiedProjectV2(candidate);
}
