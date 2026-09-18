import type {
  UnifiedCellContentV2,
  UnifiedRasterBitmapV2,
  UnifiedSymbolInstanceItemV2,
  UnifiedSymbolSourceCategoryV2,
} from "./unifiedAnimationContentV2";
import type { StickAiCreationLatchV1 } from "../stickfigure/stickProjectHistory";
import { sanitizeDrawingAiProjectMemory } from "../ai/drawingAiContract.ts";
import { assertRasterPaintCoverageV1, forEachPaintCoverage } from "./unifiedRasterPaintCoverageV1.ts";

// Optional extension: absence means an existing raster-only definition. Never
// infer a rig from a category label or thumbnail. New rig definitions carry v1.
export type UnifiedStructuredSymbolPayloadV2 = {
  version: 1;
  joints: { id: string; x: number; y: number }[];
  limbs: { id: string; startJointId: string; endJointId: string }[];
  drawingPngDataUrl: string | null;
};

export type UnifiedBitmapSymbolDefinitionV2 = {
  definitionId: string;
  name: string;
  sourceCategory: UnifiedSymbolSourceCategoryV2;
  width: number;
  height: number;
  pngDataUrl: string;
  assetSha256: string;
  definitionDigest: string;
  structuredPayload?: UnifiedStructuredSymbolPayloadV2;
};

export type UnifiedProjectAssetV2 = {
  assetId: string;
  name: string;
  kind: "image" | "file";
  mimeType: string;
  byteLength: number;
  width: number | null;
  height: number | null;
  dataUrl: string | null;
  assetSha256: string;
};

export type UnifiedProjectCatalogsV2 = {
  symbols: UnifiedBitmapSymbolDefinitionV2[];
  assets: UnifiedProjectAssetV2[];
};

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
  catalogs: UnifiedProjectCatalogsV2;
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
  provenance?:
    | { kind: "native" }
    | {
        kind: "legacy-adoption";
        migrationVersion: 2;
        sourceKind: "drawing-v1" | "drawing-v2" | "stick-v1" | "stick-v2" | "unified-v1";
        sourceProjectId: string;
        sourceRevision: number;
        sourceRecordDigest: string;
        sourceCandidateDigest: string;
        adoptedAt: string | null;
      }
    | {
        kind: "copy";
        parentProjectId: string;
        parentRevision: number;
        parentProjectDigest: string;
      };
  auxiliary?: {
    drawingAiMemory: unknown | null;
    stickAiCreationLatch: StickAiCreationLatchV1 | null;
    rigRetirementReceipt?: {
      version: 3;
      rendererVersion: "legacy-rig-raster/v1";
      sourceKind: "drawing-v1" | "drawing-v2" | "stick-v1" | "stick-v2" | "unified-v1" | "unified-v2";
      sourceProjectId: string;
      sourceRevision: number;
      sourceDigest: string;
      convertedOwnerCellIds: string[];
      convertedItemIds: string[];
      convertedDefinitionIds: string[];
      outputContentDigest: string;
      recovery: { kind: "immutable-version" | "legacy-source"; projectId: string; revision: number; digest: string };
    };
  };
  document: UnifiedAnimationDocumentV2;
  compatibility?: {
    drawingData: unknown;
    stickByCell: Record<string, import("../../components/workspace/stickfigure/types").StickFigureFrameContent>;
    symbolInstancesByCell?: Record<string, UnifiedSymbolInstanceItemV2[]>;
    sourceIdentityByCell?: Record<string, { sourceLayerId: string; sourceCellId: string; sourceStateId: number }>;
  };
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const sha256 = /^sha256:[0-9a-f]{64}$/;
const bareSha256 = /^[0-9a-f]{64}$/;
const finite = (value: number) => Number.isFinite(value) && !Object.is(value, -0);
const canonicalText = (value: unknown, maximum: number, allowEmpty = true) =>
  typeof value === "string" && value.normalize("NFC") === value && new TextEncoder().encode(value).byteLength <= maximum && (allowEmpty || value.trim().length > 0);
const validTimestamp = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

const assertRasterBitmap = (bitmap: UnifiedRasterBitmapV2 | null | undefined) => {
  if (bitmap == null) return;
  if (!Number.isInteger(bitmap.width) || bitmap.width < 1 || !Number.isInteger(bitmap.height) || bitmap.height < 1 ||
    !(bitmap.data instanceof Uint8ClampedArray) || bitmap.data.byteLength !== bitmap.width * bitmap.height * 4 || bitmap.data.byteLength > 268_435_456) throw new Error("invalid_record");
  for (const value of [bitmap.x ?? 0, bitmap.y ?? 0, bitmap.stageWidth ?? bitmap.width, bitmap.stageHeight ?? bitmap.height]) if (!finite(value)) throw new Error("invalid_record");
  if (Object.prototype.hasOwnProperty.call(bitmap, "paintCoverage")) {
    const coverage = assertRasterPaintCoverageV1(bitmap.paintCoverage!, bitmap.stageWidth ?? bitmap.width, bitmap.stageHeight ?? bitmap.height);
    const originX = bitmap.x ?? 0, originY = bitmap.y ?? 0;
    if (!Number.isSafeInteger(originX) || !Number.isSafeInteger(originY)) throw new Error("invalid_record");
    forEachPaintCoverage(coverage, (pixel, x, y) => {
      const localX = x - originX, localY = y - originY;
      if (localX < 0 || localY < 0 || localX >= bitmap.width || localY >= bitmap.height ||
        bitmap.data[(localY * bitmap.width + localX) * 4 + 3] < pixel.coverage) throw new Error("invalid_record");
    });
  }
};

export function assertStructuredSymbolPayloadV2(definition: Pick<UnifiedBitmapSymbolDefinitionV2, "sourceCategory" | "structuredPayload">) {
  if (!Object.prototype.hasOwnProperty.call(definition, "structuredPayload")) return;
  const payload = definition.structuredPayload;
  const exactKeys = (value: object, keys: string[]) => Object.keys(value).sort().join(",") === keys.sort().join(",");
  if (!payload || payload.version !== 1 || !exactKeys(payload, ["version", "joints", "limbs", "drawingPngDataUrl"]) ||
    !Array.isArray(payload.joints) || !payload.joints.length || payload.joints.length > 10000 ||
    !Array.isArray(payload.limbs) || payload.limbs.length > 10000 ||
    definition.sourceCategory === "Drawing Symbol" ||
    (definition.sourceCategory === "Stick Figure Symbol" ? payload.drawingPngDataUrl !== null :
      typeof payload.drawingPngDataUrl !== "string" || !payload.drawingPngDataUrl.startsWith("data:image/png;base64,"))) throw new Error("invalid_record");
  const ids = new Set<string>();
  for (const joint of payload.joints) {
    if (!joint || !exactKeys(joint, ["id", "x", "y"]) || typeof joint.id !== "string" || !joint.id || ids.has(joint.id) ||
      !finite(joint.x) || !finite(joint.y) || joint.x < 0 || joint.x > 1 || joint.y < 0 || joint.y > 1) throw new Error("invalid_record");
    ids.add(joint.id);
  }
  const limbIds = new Set<string>();
  for (const limb of payload.limbs) {
    if (!limb || !exactKeys(limb, ["id", "startJointId", "endJointId"]) || typeof limb.id !== "string" || !limb.id || limbIds.has(limb.id) ||
      !ids.has(limb.startJointId) || !ids.has(limb.endJointId) || limb.startJointId === limb.endJointId) throw new Error("invalid_record");
    limbIds.add(limb.id);
  }
}

export function assertUnifiedAnimationDocumentV2(document: UnifiedAnimationDocumentV2) {
  if (document.kind !== "diamond-animation-document" || document.schemaVersion !== 2 || !uuid.test(document.projectId)) throw new Error("invalid_record");
  if (!Number.isInteger(document.fps) || document.fps < 1 || document.fps > 55) throw new Error("invalid_record");
  if (document.layers.length < 1 || document.layers.length > 64) throw new Error("invalid_record");
  const layerIds = new Set<string>();
  const itemIds = new Set<string>();
  const symbolDefinitions = new Map<string, UnifiedBitmapSymbolDefinitionV2>();
  const symbolNames = new Set<string>();
  const symbolDigests = new Set<string>();
  const assetIds = new Set<string>();
  const assetNames = new Set<string>();
  for (const definition of document.catalogs.symbols) {
    assertStructuredSymbolPayloadV2(definition);
    const normalizedName = definition.name.trim().toLocaleLowerCase();
    if (
      !uuid.test(definition.definitionId) ||
      symbolDefinitions.has(definition.definitionId) ||
      !normalizedName ||
      symbolNames.has(normalizedName) ||
      !Number.isInteger(definition.width) ||
      definition.width < 1 ||
      !Number.isInteger(definition.height) ||
      definition.height < 1 ||
      !definition.pngDataUrl.startsWith("data:image/png;base64,") ||
      !sha256.test(definition.assetSha256) ||
      !sha256.test(definition.definitionDigest) ||
      !["Drawing Symbol", "Mixed Symbol", "Stick Figure Symbol", "Drawing and Stick Figure Symbol"].includes(definition.sourceCategory)
    ) throw new Error("invalid_record");
    symbolDefinitions.set(definition.definitionId, definition);
    symbolNames.add(normalizedName);
    symbolDigests.add(definition.definitionDigest);
  }
  for (const asset of document.catalogs.assets) {
    const normalizedName = asset.name.trim().toLocaleLowerCase();
    if (
      !uuid.test(asset.assetId) ||
      assetIds.has(asset.assetId) ||
      !normalizedName ||
      assetNames.has(normalizedName) ||
      !asset.mimeType.trim() ||
      !Number.isSafeInteger(asset.byteLength) ||
      asset.byteLength < 0 ||
      !sha256.test(asset.assetSha256) ||
      !["image", "file"].includes(asset.kind) ||
      (asset.kind === "image" && (
        !["image/png", "image/jpeg", "image/webp"].includes(asset.mimeType) ||
        !asset.dataUrl?.startsWith(`data:${asset.mimeType};base64,`) ||
        asset.byteLength < 1 ||
        asset.byteLength > 16_777_216 ||
        !Number.isInteger(asset.width) ||
        asset.width! < 1 ||
        asset.width! > 8_192 ||
        !Number.isInteger(asset.height) ||
        asset.height! < 1 ||
        asset.height! > 8_192 ||
        asset.width! * asset.height! > 33_554_432 ||
        asset.width! * asset.height! * 4 > 134_217_728
      )) ||
      (asset.kind === "file" && (asset.dataUrl !== null || asset.width !== null || asset.height !== null))
    ) throw new Error("invalid_record");
    assetIds.add(asset.assetId);
    assetNames.add(normalizedName);
  }
  for (const [order, layer] of document.layers.entries()) {
    if (!uuid.test(layer.layerId) || layerIds.has(layer.layerId) || layer.orderIndex !== order || !layer.name.trim() || "contentKind" in layer) throw new Error("invalid_record");
    layerIds.add(layer.layerId);
    if (layer.cells.length < 1 || layer.cells.length > 10_000) throw new Error("invalid_record");
    const cellIds = new Set(layer.cells.map(cell => cell.cellId));
    if (cellIds.size !== layer.cells.length) throw new Error("invalid_record");
    for (const [index, cell] of layer.cells.entries()) {
      if (!uuid.test(cell.cellId)) throw new Error("invalid_record");
      if (cell.cellType === "empty") { if (cell.ownerCellId !== null || cell.content !== null) throw new Error("invalid_cell_owner"); continue; }
      const ownerIndex = layer.cells.findIndex(candidate => candidate.cellId === cell.ownerCellId);
      if (ownerIndex < 0 || ownerIndex > index) throw new Error("invalid_cell_owner");
      if (cell.ownerCellId === cell.cellId) {
        if (!cell.content) throw new Error("invalid_cell_owner");
        if (cell.cellType === "blank-keyframe" && cell.content.items.length !== 0) throw new Error("invalid_record");
        for (const item of cell.content.items) {
          if (!uuid.test(item.itemId) || itemIds.has(item.itemId)) throw new Error("invalid_record");
          itemIds.add(item.itemId);
          if (item.kind === "drawing-raster/v1") {
            assertRasterBitmap(item.bitmap);
            assertRasterBitmap(item.tweenEndBitmap);
            if (item.motionTween) {
              if (item.motionTween.mode !== "position" || !Number.isInteger(item.motionTween.stageWidth) || item.motionTween.stageWidth < 1 ||
                !Number.isInteger(item.motionTween.stageHeight) || item.motionTween.stageHeight < 1) throw new Error("invalid_record");
              assertRasterBitmap(item.motionTween.spriteBitmap);
              for (const origin of [item.motionTween.startOrigin, item.motionTween.endOrigin]) if (origin && (!finite(origin.x) || !finite(origin.y))) throw new Error("invalid_record");
            }
            if (item.sourceTransform && (item.sourceTransform.targetWidth !== 1920 || item.sourceTransform.targetHeight !== 1080 ||
              !finite(item.sourceTransform.scale) || item.sourceTransform.scale <= 0 || !finite(item.sourceTransform.offsetX) || !finite(item.sourceTransform.offsetY) ||
              !Number.isInteger(item.sourceTransform.sourceWidth) || item.sourceTransform.sourceWidth < 1 || !Number.isInteger(item.sourceTransform.sourceHeight) || item.sourceTransform.sourceHeight < 1)) throw new Error("invalid_record");
            for (const stroke of item.strokes) for (const point of stroke.points) if (!finite(point.x) || !finite(point.y)) throw new Error("invalid_record");
          } else if (item.kind === "drawing-text/v1") {
            if (!finite(item.x) || !finite(item.y) || !finite(item.fontSize)) throw new Error("invalid_record");
          } else if (item.kind === "stick-rig/v1") {
            const jointIds = new Set(item.content.structureGraph.joints.map(joint => joint.id));
            if (jointIds.size !== item.content.structureGraph.joints.length || item.content.structureGraph.limbs.some(limb => !jointIds.has(limb.startJointId) || !jointIds.has(limb.endJointId))) throw new Error("invalid_record");
          } else if (item.kind === "symbol-instance/v1") {
            const definition = symbolDefinitions.get(item.definitionId);
            if (
              !definition ||
              definition.definitionDigest !== item.definitionDigest ||
              !finite(item.x) ||
              !finite(item.y) ||
              !finite(item.width) ||
              item.width <= 0 ||
              !finite(item.height) ||
              item.height <= 0 ||
              !finite(item.rotation)
            ) throw new Error("invalid_record");
          } else throw new Error("invalid_record");
        }
      } else if (cell.content !== null || !cellIds.has(cell.ownerCellId!)) throw new Error("invalid_cell_owner");
      if (cell.content?.soundAttachment) {
        const sound = cell.content.soundAttachment;
        if (!canonicalText(sound.id, 4096, false) || !canonicalText(sound.title, 4096) || !canonicalText(sound.description, 16_384) ||
          sound.sourceTask !== "generate-sounds" || !validTimestamp(sound.attachedAt) ||
          (sound.audioDataUrl != null && (typeof sound.audioDataUrl !== "string" || !sound.audioDataUrl.startsWith("data:audio/")))) throw new Error("invalid_record");
      }
    }
  }
  if (symbolDigests.size !== document.catalogs.symbols.length) throw new Error("invalid_record");
  if (!layerIds.has(document.reopenState.activeLayerId)) throw new Error("invalid_record");
  return document;
}

export function assertUnifiedAnimationProjectV2(project: UnifiedAnimationProjectV2) {
  if (project.kind !== "diamond-animation-project" || project.schemaVersion !== 2 || project.projectId !== project.document.projectId || !uuid.test(project.projectId)) throw new Error("invalid_record");
  if (!canonicalText(project.title, 512, false) || !validTimestamp(project.createdAt) || !validTimestamp(project.updatedAt) || !Number.isSafeInteger(project.revision) || project.revision < 0) throw new Error("invalid_record");
  if (project.provenance?.kind === "legacy-adoption") {
    const provenance = project.provenance;
    if (provenance.migrationVersion !== 2 || !["drawing-v1", "drawing-v2", "stick-v1", "stick-v2", "unified-v1"].includes(provenance.sourceKind) ||
      !canonicalText(provenance.sourceProjectId, 512, false) || !Number.isSafeInteger(provenance.sourceRevision) || provenance.sourceRevision < 0 ||
      !bareSha256.test(provenance.sourceRecordDigest) || !bareSha256.test(provenance.sourceCandidateDigest) ||
      (provenance.adoptedAt !== null && !validTimestamp(provenance.adoptedAt))) throw new Error("invalid_record");
  } else if (project.provenance?.kind === "copy") {
    if (!uuid.test(project.provenance.parentProjectId) || !Number.isSafeInteger(project.provenance.parentRevision) || project.provenance.parentRevision < 0 ||
      !bareSha256.test(project.provenance.parentProjectDigest)) throw new Error("invalid_record");
  } else if (project.provenance && project.provenance.kind !== "native") throw new Error("invalid_record");
  if (project.auxiliary?.stickAiCreationLatch && project.auxiliary.stickAiCreationLatch.projectId !== project.projectId) throw new Error("invalid_record");
  if (project.auxiliary?.drawingAiMemory) {
    const memory = sanitizeDrawingAiProjectMemory(project.auxiliary.drawingAiMemory);
    if (!memory || memory.ownerProjectId !== project.projectId || JSON.stringify(memory) !== JSON.stringify(project.auxiliary.drawingAiMemory)) throw new Error("invalid_record");
  }
  const receipt = project.auxiliary?.rigRetirementReceipt;
  if (receipt && (
    receipt.version !== 3 || receipt.rendererVersion !== "legacy-rig-raster/v1" ||
    !["drawing-v1", "drawing-v2", "stick-v1", "stick-v2", "unified-v1", "unified-v2"].includes(receipt.sourceKind) ||
    !canonicalText(receipt.sourceProjectId, 512, false) || !Number.isSafeInteger(receipt.sourceRevision) || receipt.sourceRevision < 0 ||
    !canonicalText(receipt.sourceDigest, 512, false) || !bareSha256.test(receipt.outputContentDigest) ||
    !Array.isArray(receipt.convertedOwnerCellIds) || !Array.isArray(receipt.convertedItemIds) || !Array.isArray(receipt.convertedDefinitionIds) ||
    receipt.recovery.projectId !== receipt.sourceProjectId || receipt.recovery.revision !== receipt.sourceRevision || receipt.recovery.digest !== receipt.sourceDigest ||
    !["immutable-version", "legacy-source"].includes(receipt.recovery.kind)
  )) throw new Error("invalid_record");
  assertUnifiedAnimationDocumentV2(project.document);
  return project;
}

export function assertDrawingOnlyUnifiedProjectV2(project: UnifiedAnimationProjectV2) {
  assertUnifiedAnimationProjectV2(project);
  if (project.document.layers.some(layer => layer.cells.some(cell => cell.content?.items.some(item => item.kind === "stick-rig/v1"))) ||
    project.document.catalogs.symbols.some(definition => Boolean(definition.structuredPayload)) ||
    Object.keys(project.compatibility?.stickByCell ?? {}).length > 0) throw new Error("rig_migration_incomplete");
  return project;
}
