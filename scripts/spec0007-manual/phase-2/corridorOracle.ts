import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DRAW_RIG_CORRIDOR_ALGORITHM,
  DRAW_RIG_CORRIDOR_DEFAULTS,
  DrawRigCorridor,
  type DrawRigPoint,
} from "../../../src/lib/animation/editorCommands/drawRigCorridor.ts";
import {
  RasterGestureDraft,
  canonicalPaint,
  canonicalSamples,
  smoothCenterline,
  type MaximumMask,
  type RasterGestureOptions,
  type RasterPreview,
} from "../../../src/lib/animation/editorCommands/rasterGesture.ts";

type FixtureCase = {
  id: string;
  family: string;
  points?: [number, number][];
  generatedCircle?: { centerX: number; centerY: number; radius: number; samples: number };
  expectedOutput?: [number, number][];
  expectedVertices?: number;
  minimumVertices?: number;
  maximumVertices?: number;
};

const fixture = JSON.parse(readFileSync(
  "scripts/fixtures/spec0007-manual/phase-2/contract.json",
  "utf8",
)) as {
  algorithm: string;
  corridor: typeof DRAW_RIG_CORRIDOR_DEFAULTS;
  cases: FixtureCase[];
  strengthCases: FixtureCase[];
  equivalencePairs: [string, string][];
  strengthEquivalencePairs: [string, string][];
  smoothingLevels: number[];
};

assert.equal(fixture.algorithm, DRAW_RIG_CORRIDOR_ALGORITHM);
assert.deepEqual(fixture.corridor, DRAW_RIG_CORRIDOR_DEFAULTS);
let assertions = 0;
const check = (value: unknown, label: string) => {
  assertions += 1;
  assert.ok(value, label);
};
const point = ([x, y]: [number, number]): DrawRigPoint => ({ x, y });
const distance = (a: DrawRigPoint, b: DrawRigPoint) => Math.hypot(b.x - a.x, b.y - a.y);
const key = (value: DrawRigPoint) => `${value.x.toFixed(3)}:${value.y.toFixed(3)}`;
const casePoints = (fixtureCase: FixtureCase): [number, number][] => {
  if (fixtureCase.points) return fixtureCase.points;
  const circle = fixtureCase.generatedCircle;
  if (!circle) throw new Error(`missing_points:${fixtureCase.id}`);
  return Array.from({ length: circle.samples + 1 }, (_, index) => {
    const angle = index * Math.PI * 2 / circle.samples;
    return [
      Math.round((circle.centerX + circle.radius * Math.cos(angle)) * 1000) / 1000,
      Math.round((circle.centerY + circle.radius * Math.sin(angle)) * 1000) / 1000,
    ];
  });
};
const render = (input: readonly [number, number][]) => {
  const corridor = new DrawRigCorridor();
  const lockedPrefixes: DrawRigPoint[][] = [];
  const lockEvents: Array<{ inputIndex: number; from: DrawRigPoint; to: DrawRigPoint }> = [];
  input.forEach((value, inputIndex) => {
    const update = corridor.append(point(value));
    if (update.lockedSegment) lockEvents.push({ inputIndex, ...update.lockedSegment });
    lockedPrefixes.push(corridor.getLockedVertices().map(vertex => ({ ...vertex })));
  });
  const verticesBeforeSeal = corridor.getVertices();
  corridor.seal();
  check(JSON.stringify(corridor.getVertices()) === JSON.stringify(verticesBeforeSeal), "release does not refit the completed stroke");
  return { corridor, vertices: verticesBeforeSeal, lockedPrefixes, lockEvents };
};

const results = new Map<string, ReturnType<typeof render>>();
for (const fixtureCase of fixture.cases) {
  const points = casePoints(fixtureCase);
  const result = render(points);
  results.set(fixtureCase.id, result);
  if (fixtureCase.minimumVertices != null) check(
    result.vertices.length >= fixtureCase.minimumVertices,
    `${fixtureCase.id}: retains deliberate bends`,
  );
  if (fixtureCase.maximumVertices != null) check(
    result.vertices.length <= fixtureCase.maximumVertices,
    `${fixtureCase.id}: collapses stationary/noisy samples`,
  );

  const acceptedInput = new Set(points.map(value => key(point(value))));
  check(result.vertices.every(vertex => acceptedInput.has(key(vertex))), `${fixtureCase.id}: no invented peak`);
  check(result.vertices.every((vertex, index) => index === 0 || distance(result.vertices[index - 1], vertex) >= 0.75), `${fixtureCase.id}: no duplicate bend`);
  check(key(result.vertices[0]) === key(point(points[0])), `${fixtureCase.id}: preserves start`);
  if (fixtureCase.family !== "stationary") {
    check(key(result.vertices.at(-1)!) === key(point(points.at(-1)!)), `${fixtureCase.id}: preserves endpoint`);
  }

  for (let index = 1; index < result.lockedPrefixes.length; index += 1) {
    const previous = result.lockedPrefixes[index - 1];
    const next = result.lockedPrefixes[index];
    check(
      previous.every((vertex, vertexIndex) => key(vertex) === key(next[vertexIndex])),
      `${fixtureCase.id}: locked prefix immutable at sample ${index}`,
    );
  }
}

const strengthResults = new Map<string, ReturnType<typeof render>>();
const strengthFailures: string[] = [];
const strengthCheck = (value: unknown, label: string) => {
  assertions += 1;
  if (!value) strengthFailures.push(label);
};
for (const fixtureCase of fixture.strengthCases) {
  const points = casePoints(fixtureCase);
  const result = render(points);
  strengthResults.set(fixtureCase.id, result);
  const acceptedInput = new Set(points.map(value => key(point(value))));
  check(result.vertices.every(vertex => acceptedInput.has(key(vertex))), `${fixtureCase.id}: no invented peak`);
  check(result.vertices.every((vertex, index) => index === 0 || distance(result.vertices[index - 1], vertex) >= 0.75), `${fixtureCase.id}: no duplicate bend`);
  check(key(result.vertices[0]) === key(point(points[0])), `${fixtureCase.id}: preserves start`);
  check(key(result.vertices.at(-1)!) === key(point(points.at(-1)!)), `${fixtureCase.id}: preserves endpoint`);
  for (let index = 1; index < result.lockedPrefixes.length; index += 1) {
    const previous = result.lockedPrefixes[index - 1];
    const next = result.lockedPrefixes[index];
    check(previous.every((vertex, vertexIndex) => key(vertex) === key(next[vertexIndex])), `${fixtureCase.id}: locked prefix immutable at sample ${index}`);
  }
  if (fixtureCase.expectedVertices != null) strengthCheck(result.vertices.length === fixtureCase.expectedVertices, `${fixtureCase.id}: expected ${fixtureCase.expectedVertices} vertices, received ${result.vertices.length}`);
  if (fixtureCase.expectedOutput) strengthCheck(
    JSON.stringify(result.vertices) === JSON.stringify(fixtureCase.expectedOutput.map(point)),
    `${fixtureCase.id}: exact strengthened centerline`,
  );
  if (fixtureCase.minimumVertices != null) strengthCheck(result.vertices.length >= fixtureCase.minimumVertices, `${fixtureCase.id}: retains at least ${fixtureCase.minimumVertices} vertices`);
  if (fixtureCase.maximumVertices != null) strengthCheck(result.vertices.length <= fixtureCase.maximumVertices, `${fixtureCase.id}: retains at most ${fixtureCase.maximumVertices} vertices`);
}

const noisyFast = results.get("noisy-straight-fast")!;
const noisySlow = results.get("noisy-straight-slow")!;
check(noisyFast.vertices.length === 2 && noisySlow.vertices.length === 2, "small hand wobble becomes one straight-ish run");

const hardSlow = results.get("hard-turn-slow")!;
check(hardSlow.lockEvents[0]?.inputIndex === 11, "first genuine strengthened-corridor departure locks immediately");
check(key(hardSlow.lockEvents[0].to) === key(point([100, 28])), "immediate bend promotes the previously visible endpoint");

const hausdorff = (left: readonly DrawRigPoint[], right: readonly DrawRigPoint[]) => {
  const directed = (a: readonly DrawRigPoint[], b: readonly DrawRigPoint[]) => Math.max(...a.map(value => Math.min(...b.map(other => distance(value, other)))));
  return Math.max(directed(left, right), directed(right, left));
};
for (const [fastId, slowId] of fixture.equivalencePairs) {
  const fast = results.get(fastId)!.vertices;
  const slow = results.get(slowId)!.vertices;
  check(hausdorff(fast, slow) <= fixture.corridor.tolerance, `${fastId}/${slowId}: fast and slow traversal stay corridor-equivalent`);
  check(key(fast[0]) === key(slow[0]) && key(fast.at(-1)!) === key(slow.at(-1)!), `${fastId}/${slowId}: endpoints exactly equivalent`);
}

for (const [fastId, slowId] of fixture.strengthEquivalencePairs) {
  const fast = strengthResults.get(fastId)!.vertices;
  const slow = strengthResults.get(slowId)!.vertices;
  strengthCheck(hausdorff(fast, slow) <= 6, `${fastId}/${slowId}: strength cadence remains equivalent`);
  strengthCheck(key(fast[0]) === key(slow[0]) && key(fast.at(-1)!) === key(slow.at(-1)!), `${fastId}/${slowId}: strength endpoints exactly equivalent`);
}

for (const fixtureCase of [...fixture.cases, ...fixture.strengthCases]) {
  const geometryBySmoothing = fixture.smoothingLevels.map(() => JSON.stringify(render(casePoints(fixtureCase)).vertices));
  check(new Set(geometryBySmoothing).size === 1, `${fixtureCase.id}: smoothing bypass is exact`);
}

const stationary = results.get("stationary-input")!;
check(stationary.corridor.getAcceptedSampleCount() === 1, "stationary micro-samples produce no geometry output");

const linearRuns = [];
for (const count of [1_000, 10_000, 100_000]) {
  const corridor = new DrawRigCorridor();
  for (let index = 0; index < count; index += 1) {
    corridor.append({ x: index, y: index % 23 === 0 ? 18 : index % 17 === 0 ? -18 : 0 });
  }
  const row = {
    samples: count,
    accepted: corridor.getAcceptedSampleCount(),
    workUnits: corridor.getWorkUnits(),
    workPerSample: corridor.getWorkUnits() / count,
    liveStateSlots: corridor.getLiveStateSlots(),
    outputVertices: corridor.getVertices().length,
  };
  linearRuns.push(row);
  check(row.workPerSample <= 14, `${count}: bounded work per sample`);
  check(row.liveStateSlots === 5, `${count}: bounded live decision state`);
}
check(linearRuns[2].workUnits <= linearRuns[1].workUnits * 10.05, "100k growth remains linear");

const variants = ["Brush", "Pencil", "Sketch", "Pixelate", "Glow"] as const;
const opacityBytes = [255, 128, 26, 0] as const;
const maskEntries = (masks: readonly MaximumMask[]) => {
  const pixels = new Map<number, [number, number]>();
  for (const mask of masks) for (const [tileKey, tile] of mask.tiles) {
    for (let index = 0; index < tile.coverage.length; index += 1) {
      const coverage = tile.coverage[index];
      const light = tile.light[index];
      if (!coverage && !light) continue;
      const keyValue = tileKey * 1024 + index;
      const previous = pixels.get(keyValue) ?? [0, 0];
      pixels.set(keyValue, [Math.max(previous[0], coverage), Math.max(previous[1], light)]);
    }
  }
  return [...pixels].sort(([left], [right]) => left - right);
};
const maskDigest = (masks: readonly MaximumMask[]) => createHash("sha256").update(JSON.stringify(maskEntries(masks))).digest("hex");
const rasterOptions = (
  variant: typeof variants[number],
  opacityByte: number,
  smoothing: number,
  drawRig = true,
): RasterGestureOptions => ({
  key: canonicalPaint(variant, "#1264c8", 100 - opacityByte / 255 * 100),
  size: 6,
  smoothing,
  brightness: 60,
  radius: 40,
  seed: 173,
  width: 800,
  height: 420,
  scaleX: 1,
  scaleY: 1,
  ...(drawRig ? { drawRig: true as const } : {}),
});
const renderRaster = (input: readonly [number, number][], options: RasterGestureOptions) => {
  const draft = new RasterGestureDraft(options);
  const previews: RasterPreview[] = [];
  for (const value of input) {
    const preview = draft.append(point(value));
    if (preview) previews.push(preview);
  }
  const final = draft.seal();
  check(final === previews.at(-1), "release reuses the final live preview");
  const masks = final ? [final.stable, final.tail] : [];
  const entries = maskEntries(masks);
  return {
    centerline: final?.centerline.map(value => ({ ...value })) ?? [],
    digest: maskDigest(masks),
    pixels: entries.length,
    maximumCoverage: Math.max(0, ...entries.map(([, value]) => value[0])),
    previews,
  };
};

const noisyFastInput = casePoints(fixture.cases.find(value => value.id === "noisy-straight-fast")!);
const noisySlowInput = casePoints(fixture.cases.find(value => value.id === "noisy-straight-slow")!);
const rasterMatrix = [];
for (const variant of variants) for (const opacityByte of opacityBytes) {
  const low = renderRaster(noisySlowInput, rasterOptions(variant, opacityByte, 0));
  const high = renderRaster(noisySlowInput, rasterOptions(variant, opacityByte, 100));
  const fast = renderRaster(noisyFastInput, rasterOptions(variant, opacityByte, 50));
  check(JSON.stringify(low.centerline) === JSON.stringify(high.centerline), `${variant}/${opacityByte}: Draw Rig bypasses smoothing geometry`);
  check(low.digest === high.digest, `${variant}/${opacityByte}: smoothing cannot alter Draw Rig pixels`);
  check(fast.digest === low.digest, `${variant}/${opacityByte}: fast/slow straight traversal is pixel-identical`);
  check(low.maximumCoverage === opacityByte, `${variant}/${opacityByte}: configured transparency is the coverage maximum`);
  check(opacityByte === 0 ? low.pixels === 0 : low.pixels > 0, `${variant}/${opacityByte}: expected visibility`);
  if (variant === "Pencil" || variant === "Sketch") {
    check(maskEntries([low.previews.at(-1)!.stable, low.previews.at(-1)!.tail]).every(([, value]) => value[0] === opacityByte), `${variant}/${opacityByte}: texture marks never accumulate opacity`);
  }
  rasterMatrix.push({ variant, opacityByte, pixels: low.pixels, maximumCoverage: low.maximumCoverage, digest: low.digest });
}

for (const smoothing of fixture.smoothingLevels) {
  const ordinary = new RasterGestureDraft(rasterOptions("Brush", 255, smoothing, false));
  const prefix: DrawRigPoint[] = [];
  for (const value of casePoints(fixture.cases.find(row => row.id === "shallow-turn")!)) {
    prefix.push(point(value));
    const preview = ordinary.append(point(value))!;
    check(
      JSON.stringify(preview.centerline) === JSON.stringify(smoothCenterline(canonicalSamples(prefix, ordinary.options.size), smoothing)),
      `Draw Rig OFF remains the Phase 1 centerline at smoothing ${smoothing}/${prefix.length}`,
    );
  }
  ordinary.cancel();
}

const hardInput = casePoints(fixture.cases.find(value => value.id === "hard-turn-slow")!);
const stableDraft = new RasterGestureDraft(rasterOptions("Brush", 128, 100));
let lockedRegionDigest = "";
const firstHardLockIndex = hardSlow.lockEvents[0].inputIndex;
for (let index = 0; index < hardInput.length; index += 1) {
  const preview = stableDraft.append(point(hardInput[index]))!;
  const region = maskEntries([preview.stable]).filter(([keyValue]) => {
    const tileKey = Math.floor(keyValue / 1024), sample = keyValue % 1024;
    const tilesAcross = Math.ceil(stableDraft.options.width / 32);
    const tileX = tileKey % tilesAcross * 32, tileY = Math.floor(tileKey / tilesAcross) * 32;
    const x = tileX + sample % 32, y = tileY + Math.floor(sample / 32);
    return x >= 20 && x < 90 && y >= 10 && y < 35;
  });
  const digest = createHash("sha256").update(JSON.stringify(region)).digest("hex");
  if (index === firstHardLockIndex) lockedRegionDigest = digest;
  if (index > firstHardLockIndex) check(digest === lockedRegionDigest, `locked raster prefix immutable at hard-turn sample ${index}`);
}
stableDraft.cancel();

const report = {
  status: strengthFailures.length ? "FAIL" : "PASS",
  algorithm: DRAW_RIG_CORRIDOR_ALGORITHM,
  assertions,
  cases: [...results].map(([id, result]) => ({
    id,
    vertices: result.vertices,
    lockEvents: result.lockEvents,
    acceptedSamples: result.corridor.getAcceptedSampleCount(),
  })),
  strengthCases: [...strengthResults].map(([id, result]) => ({
    id,
    vertices: result.vertices,
    lockEvents: result.lockEvents,
    acceptedSamples: result.corridor.getAcceptedSampleCount(),
  })),
  strengthFailures,
  linearRuns,
  rasterMatrix,
};
console.log(JSON.stringify(report, null, 2));
assert.deepEqual(strengthFailures, [], "Draw Rig strength correction cases");

if (process.argv[1] && resolve(process.argv[1]) !== fileURLToPath(import.meta.url)) {
  throw new Error("corridor_oracle_entrypoint_mismatch");
}
