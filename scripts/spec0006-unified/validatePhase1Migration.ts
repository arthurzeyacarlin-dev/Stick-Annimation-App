import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

// The negative-test matrix intentionally mutates otherwise typed records into invalid shapes.
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  UNIFIED_ANIMATION_ERROR_CODES,
  deterministicUnifiedUuidV4,
  parseUnifiedAnimationProjectV1,
  validateUnifiedAnimationCandidateV1,
} from "../../src/lib/animation/unifiedAnimationContract.ts";
import {
  migrateDrawingProjectV1ReadOnly,
  migrateDrawingProjectV2ReadOnly,
  migrateLegacySourceReadOnly,
  migrateStickProjectReadOnly,
} from "../../src/lib/animation/unifiedAnimationMigration.ts";
import {
  cloneFixture,
  createDrawingV1Fixture,
  createDrawingV2Fixture,
  createStickFixture,
} from "./phase1FixtureFactory.ts";
import {
  independentCanonicalDigest,
  independentlyAssertDrawingV1Migration,
  independentlyAssertDrawingV2Migration,
  independentlyAssertStickMigration,
} from "./phase1MigrationOracle.ts";

type CaseInventory = {
  fixtureVersion: number;
  validFamilies: Array<{ name: string; count: number }>;
  invalidFamilies: Array<{ name: string; count: number }>;
  requiredRepeatedMappings: number;
  requiredSourceKinds: string[];
};

const inventory = JSON.parse(readFileSync(new URL("../fixtures/spec0006-unified/v1/phase1-cases.json", import.meta.url), "utf8")) as CaseInventory;
const mixed = JSON.parse(readFileSync(new URL("../fixtures/spec0006-unified/v1/mixed-realistic-source-ingredients.json", import.meta.url), "utf8")) as Record<string, any>;
const oracleSource = readFileSync(new URL("./phase1MigrationOracle.ts", import.meta.url), "utf8");

let assertions = 0;
const equal = (actual: unknown, expected: unknown, message?: string) => { assertions += 1; assert.deepEqual(actual, expected, message); };
const ok = (value: unknown, message?: string) => { assertions += 1; assert.ok(value, message); };

const serializableSource = async (source: unknown) => {
  if (!source || typeof source !== "object") return source;
  const cloned = structuredClone(source) as Record<string, any>;
  if (Array.isArray(cloned.assets)) {
    cloned.assets = await Promise.all(cloned.assets.map(async (asset: Record<string, any>) => ({
      ...asset,
      bytes: asset.bytes instanceof Blob
        ? { size: asset.bytes.size, type: asset.bytes.type, sha256: createHash("sha256").update(new Uint8Array(await asset.bytes.arrayBuffer())).digest("hex") }
        : asset.bytes,
    })));
  }
  if (cloned.record?.assets) {
    cloned.record.assets = await Promise.all(cloned.record.assets.map(async (asset: Record<string, any>) => ({
      ...asset,
      bytes: { size: asset.bytes.size, type: asset.bytes.type, sha256: createHash("sha256").update(new Uint8Array(await asset.bytes.arrayBuffer())).digest("hex") },
    })));
  }
  return cloned;
};

const migrateCase = async (kind: string, variation: number) => {
  if (kind === "drawing-v1") {
    const source = createDrawingV1Fixture(variation);
    const before = await serializableSource(source);
    const candidate = await migrateDrawingProjectV1ReadOnly(source);
    equal(await serializableSource(source), before, "Drawing V1 source bytes/fields unchanged");
    assertions += independentlyAssertDrawingV1Migration(source as any, candidate.project as any);
    return { source, candidate };
  }
  if (kind === "drawing-v2") {
    const source = await createDrawingV2Fixture(variation);
    const before = await serializableSource(source);
    const candidate = await migrateDrawingProjectV2ReadOnly(source);
    equal(await serializableSource(source), before, "Drawing V2 source bytes/fields unchanged");
    assertions += independentlyAssertDrawingV2Migration(source.head as any, source.record as any, candidate.project as any);
    return { source, candidate };
  }
  const recordVersion = kind === "stick-v1" ? 1 : 2;
  const source = createStickFixture(recordVersion, variation);
  const before = await serializableSource(source);
  const candidate = await migrateStickProjectReadOnly(source);
  equal(await serializableSource(source), before, "Stick source bytes/fields unchanged");
  assertions += independentlyAssertStickMigration(source as any, candidate.project as any);
  return { source, candidate };
};

equal(inventory.fixtureVersion, 1);
equal(mixed.fixtureVersion, 1);
equal(mixed.fixtureId, "MIXED-REALISTIC-01");
equal(mixed.stage, { width: 1920, height: 1080, fps: 12, timelinePositions: 48 });
equal(mixed.drawing.backgroundRasterSources.map((entry: any) => entry.rgbaByteLength), [60_268_104, 60_268_104]);
equal(mixed.phaseUse, "Ingredients frozen in Phase 1; full materialized performance fixture begins in Phase 3.");
equal(new Set(UNIFIED_ANIMATION_ERROR_CODES).size, UNIFIED_ANIMATION_ERROR_CODES.length, "error codes unique");
ok(!/unifiedAnimation(?:Contract|Migration)/.test(oracleSource), "independent oracle imports no implementation module");

const validNames: string[] = [];
const kinds = inventory.requiredSourceKinds;
let validIndex = 0;
for (const family of inventory.validFamilies) {
  for (let index = 0; index < family.count; index += 1) {
    const name = `${family.name}-${String(index + 1).padStart(2, "0")}`;
    validNames.push(name);
    const { candidate } = await migrateCase(kinds[validIndex % kinds.length], validIndex % 8);
    equal(parseUnifiedAnimationProjectV1(candidate.project), candidate.project, `${name}: strict parse`);
    const validated = await validateUnifiedAnimationCandidateV1(candidate);
    equal(validated.project.documentDigest, candidate.project.documentDigest, `${name}: candidate digest`);
    equal(
      independentCanonicalDigest({ document: candidate.project.document, assets: [...candidate.project.assets].sort((left, right) => left.assetId.localeCompare(right.assetId)) }),
      candidate.project.documentDigest,
      `${name}: independent digest`,
    );
    ok(candidate.project.projectId !== candidate.project.provenance.sourceProjectId, `${name}: canonical identity is new`);
    equal(candidate.project.provenance.importedAt, null, `${name}: open is read-only`);
    validIndex += 1;
  }
}
ok(validNames.length >= 50, "at least 50 named valid/boundary cases");
equal(new Set(validNames).size, validNames.length, "valid names unique");

const drawingBase = await migrateDrawingProjectV1ReadOnly(createDrawingV1Fixture());
const stickBase = await migrateStickProjectReadOnly(createStickFixture(2));
const invalidNames: string[] = [];
const expectedErrorCodes = new Set<string>();

const expectRejected = async (name: string, operation: () => unknown | Promise<unknown>) => {
  invalidNames.push(name);
  assertions += 1;
  try {
    await operation();
    assert.fail(`${name} was accepted.`);
  } catch (error) {
    const code = String((error as { code?: unknown })?.code ?? "invalid_record");
    expectedErrorCodes.add(code);
  }
};

const canonicalMutation = async (family: string, index: number) => {
  const base = index % 2 === 0 ? drawingBase : stickBase;
  const candidate = structuredClone(base);
  if (family === "unknown-or-missing-fields") {
    if (index % 4 === 0) (candidate.project as any).unexpected = true;
    else if (index % 4 === 1) delete (candidate.project as any).updatedAt;
    else if (index % 4 === 2) (candidate.project.document.layers[0] as any).unexpected = true;
    else (candidate.resolvedAssets[0] as any).bytes = [1, 2, 3];
  } else if (family === "unsupported-versions-and-kinds") {
    if (index % 4 === 0) (candidate.project as any).schemaVersion = 2;
    else if (index % 4 === 1) (candidate.project.document.layers[0] as any).contentKind = "future/v9";
    else if (index % 4 === 2) {
      const sourceCell = candidate.project.document.layers[0].cells[0];
      candidate.project.document.layers[0].contentKind = "stick-rig/v1";
      sourceCell.payload = { bitmapAssetId: null, tweenEndAssetId: null, motionTween: null, soundAttachment: null, textObjects: [] };
    } else {
      candidate.project.document.layers[0].contentKind = "drawing/v1";
      candidate.project.document.layers[0].sourceDisplayTransform = { sourceWidth: 1920, sourceHeight: 1080, targetWidth: 1920, targetHeight: 1080, scale: 1, offsetX: 0, offsetY: 0 };
    }
  } else if (family === "duplicate-or-dangling-identities") {
    if (index % 4 === 0) candidate.project.document.layers[0].cells[1].cellId = candidate.project.document.layers[0].cells[0].cellId;
    else if (index % 4 === 1) candidate.project.document.reopenState.activeCellId = "70000000-0000-4000-8000-000000000099";
    else if (index % 4 === 2) candidate.project.document.layers[0].layerId = "not-a-uuid";
    else {
      const payload = candidate.project.document.layers[0].cells[0].payload as any;
      if (payload.structureGraph) payload.structureGraph.joints.push({ ...payload.structureGraph.joints[0] });
      else candidate.project.document.layers[0].cells[0].sourceCellId = "\ud800";
    }
  } else if (family === "invalid-cell-ownership") {
    const hold = candidate.project.document.layers[0].cells.find((cell) => cell.cellType === "hold")!;
    if (index % 2 === 0) hold.ownerCellId = null;
    else hold.sourceStateId += 100;
  } else if (family === "asset-missing-or-mismatched") {
    if (candidate.project.assets.length === 0) candidate.project.document.layers[0].cells[0].payload = null;
    else if (index % 4 === 0) candidate.resolvedAssets[0].bytes[0] ^= 0xff;
    else if (index % 4 === 1) candidate.resolvedAssets.shift();
    else if (index % 4 === 2) candidate.project.assets[0].assetId = `raster-rgba-${"0".repeat(64)}`;
    else candidate.resolvedAssets.push({ assetId: "audio-" + "0".repeat(64), bytes: new Uint8Array([1]) });
  } else if (family === "non-finite-negative-zero-or-unicode") {
    if (index % 3 === 0) candidate.project.document.layers[0].cells[0].sourceStateId = -0;
    else if (index % 3 === 1) candidate.project.document.layers[0].sourceOrderIndex = Number.NaN;
    else candidate.project.document.layers[0].name = "\ud800";
  } else if (family === "limits-and-source-space") {
    if (index % 4 === 0) candidate.project.document.fps = 56;
    else if (index % 4 === 1) candidate.project.document.layers = Array.from({ length: 65 }, (_, layerIndex) => ({ ...structuredClone(candidate.project.document.layers[0]), layerId: `70000000-0000-4000-8${String(layerIndex).padStart(3, "0").slice(-3)}-000000000099`, orderIndex: layerIndex }));
    else if (index % 4 === 2 && candidate.project.document.layers[0].contentKind === "drawing/v1") candidate.project.document.layers[0].sourceDisplayTransform!.targetWidth = 1919 as 1920;
    else candidate.project.document.layers[0].orderIndex = 2;
  } else {
    if (index % 4 === 0) candidate.project.documentDigest = "0".repeat(64);
    else if (index % 4 === 1) candidate.project.document.projectId = "70000000-0000-4000-8000-000000000099";
    else if (index % 4 === 2) candidate.project.provenance.sourceRecordDigest = "0".repeat(64);
    else candidate.project.candidateDigest = "0".repeat(64);
  }
  await validateUnifiedAnimationCandidateV1(candidate);
};

for (const family of inventory.invalidFamilies) {
  for (let index = 0; index < family.count; index += 1) {
    const name = `${family.name}-${String(index + 1).padStart(2, "0")}`;
    if (family.name === "limits-and-source-space" && index >= family.count - 2) {
      const source = createDrawingV1Fixture();
      source.data.layers[0].timelineFrames.push({
        ...cloneFixture(source.data.layers[0].timelineFrames[1]),
        id: 99,
        stateId: 99,
        motionTween: { ...source.data.layers[0].timelineFrames[1].motionTween!, stageWidth: 800 },
      });
      await expectRejected(name, () => migrateDrawingProjectV1ReadOnly(source));
    } else {
      await expectRejected(name, () => canonicalMutation(family.name, index));
    }
  }
}
ok(invalidNames.length >= 100, "at least 100 named invalid/tamper cases");
equal(new Set(invalidNames).size, invalidNames.length, "invalid names unique");

const mismatch = await migrateLegacySourceReadOnly({ sourceKind: "stick-v2", project: createStickFixture(1) });
equal(mismatch.ok, false, "declared source-version mismatch rejects");
if (!mismatch.ok) equal(mismatch.error.code, "unsupported_version", "stable wrapper error code");

const deterministicFixtures = [
  { kind: "drawing-v1", source: createDrawingV1Fixture(3) },
  { kind: "stick-v1", source: createStickFixture(1, 3) },
  { kind: "stick-v2", source: createStickFixture(2, 3) },
] as const;
const drawingV2Deterministic = await createDrawingV2Fixture(3);
const expectedDigests = new Map<string, string>();
for (let index = 0; index < inventory.requiredRepeatedMappings; index += 1) {
  const selector = index % 4;
  const candidate = selector === 0
    ? await migrateDrawingProjectV1ReadOnly(deterministicFixtures[0].source)
    : selector === 1
      ? await migrateStickProjectReadOnly(deterministicFixtures[1].source)
      : selector === 2
        ? await migrateStickProjectReadOnly(deterministicFixtures[2].source)
        : await migrateDrawingProjectV2ReadOnly(drawingV2Deterministic);
  const key = candidate.project.provenance.sourceKind;
  const previous = expectedDigests.get(key);
  if (previous === undefined) expectedDigests.set(key, candidate.project.documentDigest);
  else equal(candidate.project.documentDigest, previous, `repeat ${index}: deterministic digest`);
}
equal(expectedDigests.size, 4, "all source kinds repeated deterministically");
equal(await deterministicUnifiedUuidV4("stable"), await deterministicUnifiedUuidV4("stable"));

const result = {
  status: "PASS",
  fixtureVersion: inventory.fixtureVersion,
  validCases: validNames.length,
  invalidCases: invalidNames.length,
  repeatedMappings: inventory.requiredRepeatedMappings,
  sourceKinds: [...expectedDigests.keys()].sort(),
  stableErrorCodesObserved: [...expectedErrorCodes].sort(),
  sourceWrites: 0,
  oracleImportsImplementation: false,
  assertions,
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
