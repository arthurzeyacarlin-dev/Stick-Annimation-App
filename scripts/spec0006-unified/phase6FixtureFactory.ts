import { createPhase4aNeutralFixture } from "./phase4aNeutralFixtureFactory.ts";
import { createBitmapSymbolDefinitionV2 } from "../../src/lib/animation/unifiedProjectCatalogV2.ts";
import type { UnifiedAnimationProjectV2 } from "../../src/lib/animation/unifiedAnimationContractV2.ts";
import type {
  UnifiedEncodedAssetV2,
  UnifiedProjectHeadV2,
  UnifiedProjectStorageAdapterV2,
  UnifiedProjectVersionV2,
} from "../../src/lib/animation/unifiedProjectStorageV2.ts";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+QyXnWQAAAABJRU5ErkJggg==";
const WAV = "data:audio/wav;base64,UklGRgQAAABXQVZF";

export async function createPhase6Project(): Promise<UnifiedAnimationProjectV2> {
  const project = createPhase4aNeutralFixture();
  project.projectId = "6a4b51bb-691d-4531-8bc4-d1fcb005b1df";
  project.document.projectId = project.projectId;
  project.title = "Phase 6 Persistence";
  project.provenance = { kind: "native" };
  project.auxiliary = { drawingAiMemory: null, stickAiCreationLatch: null };
  project.document.layers[0].layerId = "7c5c5e0f-447c-4b78-a719-77b4812f2e61";
  project.document.layers[0].cells[0].cellId = "f757515f-6f59-4c18-ae8d-a0f2afe884aa";
  project.document.layers[0].cells[0].ownerCellId = project.document.layers[0].cells[0].cellId;
  project.document.reopenState.activeLayerId = project.document.layers[0].layerId;
  const definition = await createBitmapSymbolDefinitionV2({
    definitionId: "d6626162-790f-44f0-bdc4-8802f8bb5c4f",
    name: "Phase 6 Sword",
    sourceCategory: "Drawing and Stick Figure Symbol",
    width: 96,
    height: 28,
    pngDataUrl: PNG,
    structuredPayload: {
      version: 1,
      joints: [{ id: "handle", x: 0.1, y: 0.5 }, { id: "tip", x: 0.9, y: 0.5 }],
      limbs: [{ id: "blade", startJointId: "handle", endJointId: "tip" }],
      drawingPngDataUrl: PNG,
    },
  });
  project.document.catalogs.symbols = [definition];
  const owner = project.document.layers[0].cells[0];
  const stableItemIds = [
    "53f1fac4-c660-4a42-b240-b122feab43f7",
    "519330fb-614a-4b84-927d-e03429a3d321",
    "ca52f25e-b9f9-4ae3-a4e9-6d41ed3c6098",
    "6d40683f-9e4e-4d3d-b49e-0ce78a8e929a",
  ];
  owner.content!.items.forEach((item, index) => { item.itemId = stableItemIds[index]; });
  const raster = owner.content!.items.find(item => item.kind === "drawing-raster/v1");
  if (!raster || raster.kind !== "drawing-raster/v1") throw new Error("fixture_raster_missing");
  const pixels = Uint8ClampedArray.from({ length: 64 * 32 * 4 }, (_, index) => (index * 37) % 256);
  const tweenPixels = Uint8ClampedArray.from(pixels, value => 255 - value);
  raster.bitmap = { width: 64, height: 32, data: pixels, x: 120, y: 80, stageWidth: 1920, stageHeight: 1080 };
  raster.tweenEndBitmap = { width: 64, height: 32, data: tweenPixels, x: 220, y: 180, stageWidth: 1920, stageHeight: 1080 };
  raster.motionTween = { mode: "position", stageWidth: 1920, stageHeight: 1080, spriteBitmap: { width: 64, height: 32, data: pixels.slice() }, startOrigin: { x: 120, y: 80 }, endOrigin: { x: 220, y: 180 } };
  const instance = owner.content!.items.find(item => item.kind === "symbol-instance/v1");
  if (!instance || instance.kind !== "symbol-instance/v1") throw new Error("fixture_instance_missing");
  instance.definitionId = definition.definitionId;
  instance.definitionDigest = definition.definitionDigest;
  owner.content!.soundAttachment = {
    id: "phase6-sound",
    title: "Small fixture sound",
    description: "Persistence cue",
    timingFeel: "short",
    intensityFeel: "soft",
    audioDataUrl: WAV,
    contentType: "sfx",
    speechText: null,
    sourceTask: "generate-sounds",
    attachedAt: "2026-09-13T00:00:00.000Z",
  };
  return project;
}

export async function createLargePhase6Project(input: {
  width: number;
  height: number;
  firstFill: number;
  secondFill: number;
}): Promise<UnifiedAnimationProjectV2> {
  const project = await createPhase6Project();
  project.projectId = "3c620a19-c3be-45ee-80b9-c6140b7cce55";
  project.document.projectId = project.projectId;
  project.title = "MIXED-REALISTIC-01 Phase 6 persistence";
  const raster = project.document.layers[0].cells[0].content?.items.find(item => item.kind === "drawing-raster/v1");
  if (!raster || raster.kind !== "drawing-raster/v1") throw new Error("fixture_raster_missing");
  const byteLength = input.width * input.height * 4;
  const first = new Uint8ClampedArray(byteLength);
  first.fill(input.firstFill);
  first[0] = input.firstFill + 1;
  first[first.length - 1] = input.firstFill + 2;
  const second = new Uint8ClampedArray(byteLength);
  second.fill(input.secondFill);
  second[0] = input.secondFill + 1;
  second[second.length - 1] = input.secondFill + 2;
  raster.bitmap = { width: input.width, height: input.height, data: first, x: 0, y: 0, stageWidth: input.width, stageHeight: input.height };
  raster.tweenEndBitmap = { width: input.width, height: input.height, data: second, x: 0, y: 0, stageWidth: input.width, stageHeight: input.height };
  if (!raster.motionTween) throw new Error("fixture_tween_missing");
  raster.motionTween.spriteBitmap = { width: input.width, height: input.height, data: first };
  const scale = Math.min(1920 / input.width, 1080 / input.height);
  raster.sourceTransform = {
    sourceWidth: input.width,
    sourceHeight: input.height,
    targetWidth: 1920,
    targetHeight: 1080,
    scale,
    offsetX: (1920 - input.width * scale) / 2,
    offsetY: (1080 - input.height * scale) / 2,
  };
  return project;
}

export async function createPendingLegacyProject(
  sourceKind: "drawing-v1" | "drawing-v2" | "stick-v1" | "stick-v2" | "unified-v1" = "drawing-v1",
) {
  const project = await createPhase6Project();
  project.projectId = "4dc38186-5ce0-48f7-a85c-5b1c52ef3214";
  project.document.projectId = project.projectId;
  project.revision = 0;
  project.provenance = {
    kind: "legacy-adoption",
    migrationVersion: 2,
    sourceKind,
    sourceProjectId: `legacy-${sourceKind}-project`,
    sourceRevision: sourceKind.endsWith("v2") ? 7 : 0,
    sourceRecordDigest: "1".repeat(64),
    sourceCandidateDigest: "2".repeat(64),
    adoptedAt: null,
  };
  return project;
}

const clone = <T>(value: T): T => structuredClone(value);
const versionKey = (projectId: string, revision: number, digest: string) => `${projectId}:${revision}:${digest}`;

export class Phase6MemoryStorageAdapter implements UnifiedProjectStorageAdapterV2 {
  readonly heads = new Map<string, UnifiedProjectHeadV2>();
  readonly legacy = new Map<string, UnifiedAnimationProjectV2>();
  readonly versions = new Map<string, UnifiedProjectVersionV2>();
  readonly assets = new Map<string, UnifiedEncodedAssetV2>();
  fault: "quota" | "asset" | "version" | "abort" | "cas" | null = null;

  async listHeads() { return [...this.heads.values()].map(clone); }
  async listLegacyProjects() { return [...this.legacy.values()].map(clone); }
  async readHead(projectId: string) { return clone(this.heads.get(projectId) ?? null); }
  async readLegacyProject(projectId: string) { return clone(this.legacy.get(projectId) ?? null); }
  async readVersions(projectId: string, maximumRevision: number) {
    return [...this.versions.values()].filter(version => version.projectId === projectId && version.revision <= maximumRevision).map(clone);
  }
  async readVersion(projectId: string, revision: number, projectDigest: string) {
    return clone(this.versions.get(versionKey(projectId, revision, projectDigest)) ?? null);
  }
  async readAssets(assetIds: readonly string[]) {
    return assetIds.map(assetId => {
      const asset = this.assets.get(assetId);
      if (!asset) throw new Error("asset_missing");
      return clone(asset);
    });
  }
  private currentRevision(projectId: string) {
    return this.heads.get(projectId)?.activeRevision ?? this.legacy.get(projectId)?.revision ?? null;
  }
  async stage(input: { head: UnifiedProjectHeadV2; version: UnifiedProjectVersionV2; assets: UnifiedEncodedAssetV2[]; expectedRevision: number | null }) {
    const current = this.currentRevision(input.head.projectId);
    if (input.expectedRevision === null ? current !== null : current !== input.expectedRevision) throw new Error(input.expectedRevision === null ? "duplicate_identity" : "stale_revision");
    if (this.fault === "quota") throw new Error("collection_too_large");
    if (this.fault === "abort") throw new Error("storage_write_failed");
    if (this.fault !== "asset") for (const asset of input.assets) this.assets.set(asset.assetId, clone(asset));
    if (this.fault !== "version") this.versions.set(versionKey(input.version.projectId, input.version.revision, input.version.projectDigest), clone(input.version));
  }
  async publish(head: UnifiedProjectHeadV2, expectedRevision: number | null) {
    if (this.fault === "cas") throw new Error("stale_revision");
    const current = this.currentRevision(head.projectId);
    if (expectedRevision === null ? current !== null : current !== expectedRevision) throw new Error(expectedRevision === null ? "duplicate_identity" : "stale_revision");
    this.heads.set(head.projectId, clone(head));
  }
}
