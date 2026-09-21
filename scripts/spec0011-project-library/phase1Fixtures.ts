import { migrateLegacySourceReadOnly } from "../../src/lib/animation/unifiedAnimationMigration.ts";
import type { StoredDrawingProject } from "../../src/lib/drawingProjectStorage.ts";
import { createPhase2Sources } from "../spec0006-unified/phase2FixtureFactory.ts";

export const createPhase1LegacyFixtureTransport = async () => {
  const sources = await createPhase2Sources();
  const drawingV1 = sources.find(source => source.sourceKind === "drawing-v1");
  if (!drawingV1 || drawingV1.sourceKind !== "drawing-v1") throw new Error("drawing_v1_fixture_missing");
  const unifiedRaw = structuredClone(drawingV1.project) as StoredDrawingProject;
  unifiedRaw.id = "71000000-0000-4000-8000-000000000015";
  unifiedRaw.name = "Unified study (V1)";
  const unifiedMigration = await migrateLegacySourceReadOnly({ sourceKind: "drawing-v1", project: unifiedRaw });
  if (!unifiedMigration.ok) throw new Error(unifiedMigration.error.code);
  const unified = {
    project: unifiedMigration.candidate.project,
    resolvedAssets: unifiedMigration.candidate.resolvedAssets.map(asset => ({
      assetId: asset.assetId,
      bytesBase64: Buffer.from(asset.bytes).toString("base64"),
    })),
  };
  const transport = await Promise.all(sources.map(async source => source.sourceKind === "drawing-v2" ? {
    ...source,
    record: {
      ...source.record,
      assets: await Promise.all(source.record.assets.map(async asset => ({
        ...asset,
        bytes: Buffer.from(await asset.bytes.arrayBuffer()).toString("base64"),
      }))),
    },
  } : source));
  return { sources, transport, unified };
};
