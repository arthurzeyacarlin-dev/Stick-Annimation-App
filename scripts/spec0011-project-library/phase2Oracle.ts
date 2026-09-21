import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveExportRasterTransform } from "../../src/lib/export/exportContracts.ts";
import {
  clampProjectPlayerTime,
  projectPlayerFrameAtTime,
  sampleProjectPlayerClock,
} from "../../src/lib/project-player/projectPlayerClock.ts";
import { resolveProjectPlayerCanvasGeometry } from "../../src/lib/project-player/projectPlayerGeometry.ts";

const outputRoot = resolve("output/spec-0011/phase-2/oracle");
mkdirSync(outputRoot, { recursive: true });
let assertions = 0;
const check = (value: unknown, label: string) => { assertions += 1; assert.ok(value, label); };
const equal = (actual: unknown, expected: unknown, label: string) => { assertions += 1; assert.deepEqual(actual, expected, label); };
const close = (actual: number, expected: number, tolerance: number, label: string) => {
  assertions += 1;
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);
};

equal(clampProjectPlayerTime(-4, 3), 0, "clock clamps negative time");
equal(clampProjectPlayerTime(8, 3), 3, "clock clamps past duration");
equal(clampProjectPlayerTime(Number.NaN, 3), 0, "clock fails closed for NaN");
equal(projectPlayerFrameAtTime(0, 12, 36), 0, "zero time is first frame");
equal(projectPlayerFrameAtTime(1.999, 12, 36), 23, "frame derives from floor(mediaTime * fps)");
equal(projectPlayerFrameAtTime(3, 12, 36), 35, "exact duration clamps to final frame");
equal(projectPlayerFrameAtTime(1, 12, 0), 0, "empty animation has stable frame zero");
close(sampleProjectPlayerClock({ mediaTimeSeconds: 0.4, monotonicTimeSeconds: 10, source: "performance" }, 10.75, 4), 1.15, 1e-9, "monotonic sample advances from anchor");
equal(sampleProjectPlayerClock({ mediaTimeSeconds: 3.8, monotonicTimeSeconds: 10, source: "audio" }, 11, 4), 4, "monotonic sample clamps at duration");
equal(sampleProjectPlayerClock({ mediaTimeSeconds: 2, monotonicTimeSeconds: 10, source: "performance" }, 9, 4), 2, "clock never runs backwards");

const geometryCases = [
  { id: "wide-dpr1", available: [1120, 630], stage: [1920, 1080], dpr: 1 },
  { id: "tall-dpr2", available: [500, 900], stage: [1920, 1080], dpr: 2 },
  { id: "square", available: [700, 700], stage: [1080, 1080], dpr: 1.5 },
  { id: "portrait", available: [320, 520], stage: [1080, 1920], dpr: 3 },
  { id: "maximum", available: [5000, 3000], stage: [1920, 1080], dpr: 2 },
] as const;
const geometries = geometryCases.map(input => {
  const geometry = resolveProjectPlayerCanvasGeometry(
    input.available[0], input.available[1], input.stage[0], input.stage[1], input.dpr,
  );
  check(geometry.cssWidth <= input.available[0] + 1e-6 && geometry.cssHeight <= input.available[1] + 1e-6, `${input.id} remains contained`);
  close(geometry.cssWidth / geometry.cssHeight, input.stage[0] / input.stage[1], 1e-9, `${input.id} retains saved aspect`);
  check(geometry.backingWidth <= 4096 && geometry.backingHeight <= 4096, `${input.id} backing store stays capped`);
  check(geometry.pixelRatio <= 2, `${input.id} DPR stays capped at two`);
  return { id: input.id, ...geometry };
});

const inherited = {
  exportFrame3NormalizedX: 0.749406441925578,
  oldIndependentAxisExpectedX: 0.8215350990452878,
  workspaceCentroidX: 2595.319748054835,
  referenceWidth: 4554,
  referenceHeight: 3293,
  outputWidth: 1280,
  outputHeight: 720,
  authoringWorldScale: 4.6,
  acceptedTolerance: 0.025,
};
check(
  Math.abs(inherited.exportFrame3NormalizedX - inherited.oldIndependentAxisExpectedX) > inherited.acceptedTolerance,
  "inherited frame-3 mismatch reproduces under stale independent-axis harness math",
);
const transform = resolveExportRasterTransform(
  inherited.outputWidth,
  inherited.outputHeight,
  inherited.referenceWidth,
  inherited.referenceHeight,
  inherited.authoringWorldScale,
);
const uniformExpectedX = (transform.offsetX + inherited.workspaceCentroidX * transform.scaleX) / inherited.outputWidth;
close(
  inherited.exportFrame3NormalizedX,
  uniformExpectedX,
  inherited.acceptedTolerance,
  "frame-3 X passes the unchanged accepted tolerance with uniform contain math",
);
equal(transform.scaleX, transform.scaleY, "accepted renderer uses one shape-preserving scale");
const independentScaleX = inherited.authoringWorldScale * inherited.outputWidth / inherited.referenceWidth;
check(Math.abs(independentScaleX - transform.scaleX) > 0.1, "stale harness scale differs materially from accepted uniform contain scale");

const result = {
  kind: "spec0011-phase2-oracle",
  version: 1,
  status: "PASS",
  assertions,
  clock: { authoritative: true, terminalFrame: 35, durationSeconds: 3, fps: 12 },
  geometry: geometries,
  inheritedMismatch: {
    ...inherited,
    correctedUniformExpectedX: uniformExpectedX,
    scaleX: transform.scaleX,
    scaleY: transform.scaleY,
    rootCause: "The old proof mapped authoring X and Y independently. The accepted renderer uniformly contains the saved 4554x3293 authoring reference inside 1280x720, adding horizontal matte and preserving shape.",
    productGeometryChanged: false,
    toleranceWeakened: false,
  },
};
writeFileSync(resolve(outputRoot, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
