import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";

export type QualityPoint = [number, number];
export type QualityPointMap = Record<string, QualityPoint>;
export type PlaybackTraceSample = {
  frameIndex: number;
  timestampMs: number;
  pointsByRole: QualityPointMap;
};

export type QualityCatalog = {
  fixtureVersion: number;
  provenance: {
    catalogAuthor: string;
    catalogRelationshipToCandidate: string;
    engineGeneratedOracle: boolean;
    acceptedReferenceSources: Array<{path: string; sha256: string; purpose: string}>;
    runtimeTransportSources: Array<{path: string; sha256: string}>;
  };
  acceptedWave: {
    name: string;
    frameCount: number;
    fps: number;
    minimumCycleMs: number;
    maximumCycleMs: number;
    orderedCycle: number[];
    landmarkFrameIndexes: number[];
    landmarkNames: string[];
    jointRoleOrder: string[];
    unrelatedStableRoles: string[];
    actingRoles: string[];
    segmentRolePairs: Array<[string, string]>;
    landmarks: Array<{name: string; frameIndex: number; pointsByRole: QualityPointMap}>;
    semanticOracle: {
      ready: string;
      inward: string;
      outward: string;
      minimumCanonicalWristExcursion: number;
      stableBodyCoordinateTolerance: number;
      renderedLandmarkTolerancePixels: number;
      renderedLimbLengthTolerancePixels: number;
      maximumOneFrameRenderedWristTravelPixels: number;
    };
  };
  requiredMutationCases: Array<{id: string; expectedFailure: string}>;
};

export type QualityEvidence = {
  trace: PlaybackTraceSample[];
  acceptedSourceHashesValid: boolean;
  independentOracle: boolean;
  screenshotCount: number;
  timeBasedCaptureCount: number;
  geometryTolerance: number;
  limbLengthTolerance: number;
};

const ROOT = process.cwd();
export const QUALITY_CATALOG_PATH = "scripts/fixtures/spec0005-stick/v1/quality-baseline-cases.json";
const sha256 = (bytes: string | Buffer) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const stableJson = (value: unknown) => JSON.stringify(value);
const distance = (a: QualityPoint, b: QualityPoint) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const exactKeys = (value: Record<string, unknown>, expected: readonly string[]) => {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === [...expected].sort()[index]);
};

export const readQualityCatalog = (): QualityCatalog =>
  JSON.parse(readFileSync(resolve(ROOT, QUALITY_CATALOG_PATH), "utf8")) as QualityCatalog;

export const expectedPointsForFrame = (catalog: QualityCatalog, frameIndex: number): QualityPointMap => {
  const landmarks = new Map(catalog.acceptedWave.landmarks.map((landmark) => [landmark.frameIndex, landmark.pointsByRole]));
  if (frameIndex >= 0 && frameIndex <= 3) return clone(landmarks.get(0)!);
  if (frameIndex >= 4 && frameIndex <= 7) return clone(landmarks.get(4)!);
  if (frameIndex >= 8 && frameIndex <= 11) return clone(landmarks.get(8)!);
  throw new RangeError(`No accepted wave reference exists for frame ${frameIndex}.`);
};

export const projectAcceptedPointMap = (
  catalog: QualityCatalog,
  frameIndex: number,
  stage: {width: number; height: number},
): QualityPointMap => {
  const editorWidth = 960;
  const editorHeight = 594;
  const scale = Math.min(stage.width / editorWidth, stage.height / editorHeight);
  const offsetX = (stage.width - editorWidth * scale) / 2;
  const offsetY = (stage.height - editorHeight * scale) / 2;
  return Object.fromEntries(Object.entries(expectedPointsForFrame(catalog, frameIndex)).map(([role, point]) => [
    role,
    [
      Math.round((offsetX + Math.round(point[0] * 0.5) * scale) * 1000) / 1000,
      Math.round((offsetY + Math.round(point[1] * 0.55) * scale) * 1000) / 1000,
    ] satisfies QualityPoint,
  ]));
};

const geometryDigest = (points: QualityPointMap, roles: string[]) =>
  sha256(stableJson(roles.map((role) => points[role])));

export const assessPlaybackQuality = (
  catalog: QualityCatalog,
  evidence: QualityEvidence,
  expectedForFrame: (frameIndex: number) => QualityPointMap = (frameIndex) => expectedPointsForFrame(catalog, frameIndex),
) => {
  const failures = new Set<string>();
  if (!evidence.acceptedSourceHashesValid) failures.add("accepted_source_hash_mismatch");
  if (!evidence.independentOracle || catalog.provenance.engineGeneratedOracle) failures.add("independent_oracle_missing");
  if (evidence.screenshotCount < 1) failures.add("ordinary_screenshot_missing");
  if (evidence.timeBasedCaptureCount < 1) failures.add("time_based_capture_missing");
  if (evidence.trace.length === 0 || evidence.trace.some((sample) => !Number.isFinite(sample.timestampMs))) {
    failures.add("timestamped_trace_missing");
  }

  const cycleLength = catalog.acceptedWave.orderedCycle.length;
  const cycle = evidence.trace.slice(0, cycleLength);
  if (cycle.length !== cycleLength) failures.add("complete_cycle_missing");
  if (cycle.length === cycleLength && !cycle.every((sample, index) => sample.frameIndex === catalog.acceptedWave.orderedCycle[index])) {
    failures.add("ordered_cycle_mismatch");
  }
  if (cycle.length === cycleLength) {
    const elapsed = cycle[cycle.length - 1].timestampMs - cycle[0].timestampMs;
    if (elapsed < catalog.acceptedWave.minimumCycleMs || elapsed > catalog.acceptedWave.maximumCycleMs) {
      failures.add("cycle_timing_out_of_bounds");
    }
  }

  const completeGeometry = cycle.length === cycleLength && cycle.every((sample) =>
    catalog.acceptedWave.jointRoleOrder.every((role) => {
      const point = sample.pointsByRole[role];
      return Array.isArray(point) && point.length === 2 && point.every(Number.isFinite);
    }),
  );
  if (!completeGeometry) failures.add("body_geometry_missing");
  if (completeGeometry) {
    const frameSamples = new Map<number, PlaybackTraceSample>();
    for (const sample of cycle.slice(0, -1)) frameSamples.set(sample.frameIndex, sample);
    const ready = frameSamples.get(0)!;
    const inward = frameSamples.get(4)!;
    const outward = frameSamples.get(8)!;
    const readyHand = ready.pointsByRole.rightHand;
    const inwardHand = inward.pointsByRole.rightHand;
    const outwardHand = outward.pointsByRole.rightHand;
    if (!(inwardHand[0] < inward.pointsByRole.rightElbow[0])) failures.add("inward_landmark_missing");
    if (!(outwardHand[0] > readyHand[0] && outwardHand[0] > outward.pointsByRole.rightElbow[0])) {
      failures.add("outward_landmark_missing");
    }
    const actualWristExcursion = Math.max(readyHand[0], inwardHand[0], outwardHand[0]) - Math.min(readyHand[0], inwardHand[0], outwardHand[0]);
    const expectedHands = [expectedForFrame(0).rightHand, expectedForFrame(4).rightHand, expectedForFrame(8).rightHand];
    const expectedWristExcursion = Math.max(...expectedHands.map((point) => point[0])) - Math.min(...expectedHands.map((point) => point[0]));
    const requiredExcursionRatio = catalog.acceptedWave.semanticOracle.minimumCanonicalWristExcursion / 260;
    if (actualWristExcursion + evidence.geometryTolerance < expectedWristExcursion * requiredExcursionRatio) {
      failures.add("wave_landmarks_missing");
    }
    const uniquePoseDigests = new Set([0, 4, 8].map((index) => geometryDigest(frameSamples.get(index)!.pointsByRole, catalog.acceptedWave.jointRoleOrder)));
    if (uniquePoseDigests.size < 3) failures.add("wave_landmarks_missing");

    for (const sample of cycle) {
      const expected = expectedForFrame(sample.frameIndex);
      for (const role of catalog.acceptedWave.unrelatedStableRoles) {
        if (distance(sample.pointsByRole[role], expected[role]) > evidence.geometryTolerance) {
          failures.add("unrelated_body_drift");
        }
      }
      const rightHandDelta = distance(sample.pointsByRole.rightHand, expected.rightHand);
      if (rightHandDelta > evidence.geometryTolerance) {
        if (sample.frameIndex === 4) failures.add("inward_landmark_missing");
        else if (sample.frameIndex === 8) failures.add("outward_landmark_missing");
        else failures.add("wrist_teleport");
      }
      for (const [from, to] of catalog.acceptedWave.segmentRolePairs) {
        const actualLength = distance(sample.pointsByRole[from], sample.pointsByRole[to]);
        const expectedLength = distance(expected[from], expected[to]);
        if (Math.abs(actualLength - expectedLength) > evidence.limbLengthTolerance) failures.add("limb_length_mismatch");
      }
    }
  }
  return {ok: failures.size === 0, failures: [...failures].sort()};
};

const validateCatalogStructureAndSources = (catalog: QualityCatalog) => {
  assert.equal(catalog.fixtureVersion, 1);
  assert.equal(catalog.provenance.engineGeneratedOracle, false);
  assert.match(catalog.provenance.catalogAuthor, /independent/i);
  assert.deepEqual(catalog.acceptedWave.orderedCycle, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0]);
  assert.deepEqual(catalog.acceptedWave.landmarkFrameIndexes, [0, 4, 8]);
  assert.equal(catalog.acceptedWave.frameCount, 12);
  assert.equal(catalog.acceptedWave.fps, 12);
  assert.equal(catalog.acceptedWave.segmentRolePairs.length, 10);
  assert.equal(catalog.acceptedWave.jointRoleOrder.length, 11);
  assert.equal(catalog.requiredMutationCases.length, 13);
  for (const source of [...catalog.provenance.acceptedReferenceSources, ...catalog.provenance.runtimeTransportSources]) {
    assert.equal(sha256(readFileSync(resolve(ROOT, source.path))), source.sha256, `${source.path} hash must match the independent catalog`);
  }

  const manual = JSON.parse(readFileSync(resolve(ROOT, "scripts/fixtures/stick-ai/v1/manual-wave-applied-project.json"), "utf8")) as {
    fps: number;
    rigs: Array<{joints: Array<{jointId: string; role: string}>}>;
    layers: Array<{cells: Array<{index: number; cellType: string; poses?: Array<{points: Array<{jointId: string; x: number; y: number}>}>}>}>;
  };
  assert.equal(manual.fps, 12);
  assert.equal(manual.layers[0].cells.length, 12);
  const rolesById = new Map(manual.rigs[0].joints.map((joint) => [joint.jointId, joint.role]));
  for (const landmark of catalog.acceptedWave.landmarks) {
    const cell = manual.layers[0].cells.find((candidate) => candidate.index === landmark.frameIndex);
    assert.equal(cell?.cellType, "keyframe");
    const points = Object.fromEntries(cell!.poses![0].points.map((point) => [rolesById.get(point.jointId)!, [point.x, point.y]]));
    assert.deepEqual(points, landmark.pointsByRole, `${landmark.name} oracle matches the independently authored manual project`);
  }

  const transport = JSON.parse(readFileSync(resolve(ROOT, "scripts/fixtures/stick-ai/v3/wave.json"), "utf8")) as {
    commands: Array<{type: string; frameIndex?: number; joints?: Array<{role: string; x: number; y: number}>}>;
  };
  const transportLandmarks = transport.commands.filter((command) => command.type === "create_key_pose").map((command) => ({
    frameIndex: command.frameIndex,
    pointsByRole: Object.fromEntries(command.joints!.map((point) => [point.role, [point.x, point.y]])),
  }));
  assert.deepEqual(
    transportLandmarks,
    catalog.acceptedWave.landmarks.map((landmark) => ({frameIndex: landmark.frameIndex, pointsByRole: landmark.pointsByRole})),
    "the runtime transport independently matches the accepted manual reference landmarks",
  );
};

const canonicalPassingEvidence = (catalog: QualityCatalog): QualityEvidence => ({
  trace: catalog.acceptedWave.orderedCycle.map((frameIndex, index) => ({
    frameIndex,
    timestampMs: index * (1000 / catalog.acceptedWave.fps),
    pointsByRole: expectedPointsForFrame(catalog, frameIndex),
  })),
  acceptedSourceHashesValid: true,
  independentOracle: true,
  screenshotCount: 1,
  timeBasedCaptureCount: 1,
  geometryTolerance: 2,
  limbLengthTolerance: 2,
});

export const runRequiredMutationSelfTests = (catalog: QualityCatalog) => {
  const results: Array<{id: string; expectedFailure: string; failures: string[]}> = [];
  const mutation = (id: string, mutate: (evidence: QualityEvidence) => void) => {
    const evidence = canonicalPassingEvidence(catalog);
    mutate(evidence);
    const assessment = assessPlaybackQuality(catalog, evidence);
    const expectedFailure = catalog.requiredMutationCases.find((entry) => entry.id === id)?.expectedFailure;
    assert.ok(expectedFailure, `${id} must be catalogued`);
    assert.equal(assessment.ok, false, `${id} must fail`);
    assert.ok(assessment.failures.includes(expectedFailure), `${id} must fail for ${expectedFailure}; got ${assessment.failures.join(", ")}`);
    results.push({id, expectedFailure, failures: assessment.failures});
  };
  mutation("immediate-play-pause", (evidence) => { evidence.trace = evidence.trace.slice(0, 1); });
  mutation("skipped-frame", (evidence) => { evidence.trace[3].frameIndex = 4; });
  mutation("out-of-order-frame", (evidence) => { [evidence.trace[5], evidence.trace[6]] = [evidence.trace[6], evidence.trace[5]]; });
  mutation("frozen-all-frames", (evidence) => { for (const sample of evidence.trace) sample.pointsByRole = expectedPointsForFrame(catalog, 0); });
  mutation("missing-inward-landmark", (evidence) => { evidence.trace[4].pointsByRole = expectedPointsForFrame(catalog, 0); });
  mutation("missing-outward-landmark", (evidence) => { evidence.trace[8].pointsByRole = expectedPointsForFrame(catalog, 0); });
  mutation("one-frame-wrist-teleport", (evidence) => { evidence.trace[6].pointsByRole.rightHand[0] += 300; });
  mutation("root-foot-drift", (evidence) => { evidence.trace[4].pointsByRole.hip[0] += 40; evidence.trace[4].pointsByRole.leftFoot[0] += 40; });
  mutation("broken-limb-length", (evidence) => { evidence.trace[2].pointsByRole.leftHand[0] += 90; });
  mutation("wrong-cycle-timing", (evidence) => { for (const [index, sample] of evidence.trace.entries()) sample.timestampMs = index * 20; });
  mutation("screenshot-only", (evidence) => { evidence.trace = []; evidence.timeBasedCaptureCount = 0; });
  mutation("wrong-source-hash", (evidence) => { evidence.acceptedSourceHashesValid = false; });
  mutation("circular-self-generated-reference", (evidence) => { evidence.independentOracle = false; });
  assert.deepEqual(results.map((result) => result.id), catalog.requiredMutationCases.map((entry) => entry.id));
  return results;
};

const main = () => {
  const catalog = readQualityCatalog();
  validateCatalogStructureAndSources(catalog);
  const passing = assessPlaybackQuality(catalog, canonicalPassingEvidence(catalog));
  assert.deepEqual(passing, {ok: true, failures: []});
  const mutations = runRequiredMutationSelfTests(catalog);
  const plan = JSON.parse(readFileSync(resolve(ROOT, "scripts/fixtures/spec0005-stick/v1/playback-quality-review-plan.json"), "utf8")) as Record<string, unknown>;
  assert.ok(exactKeys(plan, ["automatedFlow", "humanReview", "phase", "planVersion", "qualityCatalogPath", "requiredMutationIds", "reviewSurface", "sourceHead", "viewports"]));
  assert.deepEqual(plan.requiredMutationIds, catalog.requiredMutationCases.map((entry) => entry.id));
  console.log(JSON.stringify({
    validatorVersion: 1,
    acceptedReference: catalog.acceptedWave.name,
    acceptedSources: catalog.provenance.acceptedReferenceSources.length,
    runtimeTransportSources: catalog.provenance.runtimeTransportSources.length,
    frameCount: catalog.acceptedWave.frameCount,
    fps: catalog.acceptedWave.fps,
    landmarkFrames: catalog.acceptedWave.landmarkFrameIndexes,
    stableRoles: catalog.acceptedWave.unrelatedStableRoles.length,
    segmentCount: catalog.acceptedWave.segmentRolePairs.length,
    requiredMutationCount: mutations.length,
    mutationResults: mutations,
    result: "passed",
  }, null, 2));
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
