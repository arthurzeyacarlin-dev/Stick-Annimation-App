import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { canonicalPaint, canonicalSamples, smoothCenterline, renderedCenterline, RasterGestureDraft, mergePaintPixel, compositeRasterPaint, supercover, type RasterPoint, type RasterGestureOptions } from "../../../src/lib/animation/editorCommands/rasterGesture.ts";
import type { RasterPaintPixelV1 } from "../../../src/lib/animation/unifiedRasterPaintCoverageV1.ts";
import { currentSourceDigest, writeUnitResult } from "./proofContract.ts";

const sourceDigestBefore = currentSourceDigest();
const fixture = JSON.parse(readFileSync("scripts/fixtures/spec0007-manual/phase-1/contract.json", "utf8"));
const variants = ["Brush", "Pencil", "Sketch", "Pixelate", "Glow"] as const;
const failures: string[] = [];
let assertions = 0;
const check = (value: unknown, label: string) => { assertions++; if (!value) failures.push(label); };
for (const variant of variants) for (const [transparency, expected] of [[0, 255], [50, 128], [90, 26], [100, 0]]) {
  check(canonicalPaint(variant, "#00FFFF", transparency).opacityByte === expected, `${variant}: UI transparency ${transparency} quantization`);
}
const distance = (a: RasterPoint, b: RasterPoint) => Math.hypot(a.x - b.x, a.y - b.y);
const points = (id: string): RasterPoint[] => {
  const value = fixture.trajectories.find((row: { id: string }) => row.id === id);
  assert.ok(value, id);
  return value.points.map((p: number[] | RasterPoint) => Array.isArray(p) ? { x: p[0], y: p[1] } : p);
};
// Independent equal-distance sampler; deliberately does not call the renderer's resampler.
const sample = (path: RasterPoint[], step = .75) => {
  const lengths = [0];
  for (let i = 1; i < path.length; i++) lengths.push(lengths[i - 1] + distance(path[i - 1], path[i]));
  const out: RasterPoint[] = []; let segment = 1;
  for (let length = 0; length <= lengths.at(-1)!; length += step) {
    while (segment < path.length - 1 && lengths[segment] < length) segment++;
    const ratio = (length - lengths[segment - 1]) / (lengths[segment] - lengths[segment - 1] || 1);
    out.push({ x: path[segment - 1].x + ratio * (path[segment].x - path[segment - 1].x), y: path[segment - 1].y + ratio * (path[segment].y - path[segment - 1].y) });
  }
  if (distance(out.at(-1)!, path.at(-1)!) > 1e-7) out.push({ ...path.at(-1)! });
  return out;
};
const headings = (path: RasterPoint[]) => path.slice(1).map((p, i) => Math.atan2(p.y - path[i].y, p.x - path[i].x));
const turns = (path: RasterPoint[]) => { const h = headings(path); return h.slice(1).map((v, i) => Math.abs(Math.atan2(Math.sin(v - h[i]), Math.cos(v - h[i])))); };
const energy = (path: RasterPoint[]) => turns(sample(path)).reduce((sum, turn) => sum + turn * turn, 0);
const crosses = (path: RasterPoint[]) => {
  const side = (a: RasterPoint, b: RasterPoint, c: RasterPoint) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  let count = 0;
  for (let i = 1; i < path.length; i++) for (let j = i + 2; j < path.length; j++) {
    if (side(path[i - 1], path[i], path[j - 1]) * side(path[i - 1], path[i], path[j]) < -1e-8 && side(path[j - 1], path[j], path[i - 1]) * side(path[j - 1], path[j], path[i]) < -1e-8) count++;
  }
  return count;
};
const smoothing = variants.map(variant => {
  const input = points("noisy-line"), levels = [0, 25, 50, 75, 100];
  const paths = levels.map(level => renderedCenterline(input, 8, level));
  const jitterEnergy = paths.map(energy);
  const endpointErrors = paths.map(path => Math.max(distance(input[0], path[0]), distance(input.at(-1)!, path.at(-1)!)));
  const raw = sample(input, 1), rough = renderedCenterline(input, 8, 0);
  const deliberate = turns(raw).filter(turn => turn >= 8 * Math.PI / 180).length;
  const rawDirectionRetention = Math.min(1, turns(rough).filter(turn => turn >= 8 * Math.PI / 180).length / Math.max(1, deliberate));
  let maxCurveChordFraction = 0, newSelfIntersections = 0;
  const jumps = ["circle", "spiral", "tight-s"].map(id => {
    const rawPath = points(id), path = renderedCenterline(rawPath, 8, 100), resampled = sample(path);
    const t = turns(resampled); let chord = 0, longest = 0;
    for (const turn of t) { chord = turn < 1e-5 ? chord + 1 : 0; longest = Math.max(longest, chord); }
    maxCurveChordFraction = Math.max(maxCurveChordFraction, longest / Math.max(1, t.length));
    newSelfIntersections += Math.max(0, crosses(resampled) - crosses(sample(rawPath)));
    return Math.max(...t) * 180 / Math.PI;
  });
  check(jitterEnergy[4] <= jitterEnergy[0] * .3, `${variant}: smoothing ratio`);
  check(jitterEnergy.slice(1).every((v, i) => v <= jitterEnergy[i] * 1.02), `${variant}: monotonic smoothing`);
  check(endpointErrors.every(v => v <= 1), `${variant}: endpoints`);
  check(jumps.every(v => v <= 20), `${variant}: continuous turn`);
  check(rawDirectionRetention >= .85 && newSelfIntersections === 0 && maxCurveChordFraction <= .08, `${variant}: traversal and roughness`);
  return { variant, levels, jitterEnergy, endpointErrors, rawDirectionRetention, circleMaxHeadingJumpDegrees: jumps[0], spiralMaxHeadingJumpDegrees: jumps[1], sMaxHeadingJumpDegrees: jumps[2], maxCurveChordFraction, newSelfIntersections };
});
const options = (variant: typeof variants[number], opacityByte = 26): RasterGestureOptions => ({ key: { variant, color: "#00ffff", opacityByte }, size: 8, smoothing: 100, brightness: 50, radius: 50, seed: 173, width: 800, height: 700, scaleX: 1, scaleY: 1 });
const render = (path: RasterPoint[], option: RasterGestureOptions) => {
  const draft = new RasterGestureDraft(option);
  for (const point of path) draft.append(point);
  const preview = draft.append(path.at(-1)!);
  const final = draft.seal();
  check(preview === final, "preview and release share prepared result");
  check(draft.seal() === null, "terminal duplicate seals nothing");
  const pixels = new Map<string, RasterPaintPixelV1>();
  if (final) for (const mask of [final.stable, final.tail]) for (const tile of mask.tiles.values()) {
    for (let i = 0; i < tile.coverage.length; i++) {
      if (!tile.coverage[i]) continue;
      const key = `${tile.x + i % 32}:${tile.y + Math.floor(i / 32)}`;
      pixels.set(key, mergePaintPixel(pixels.get(key) ?? null, [0, 0, 0, 0], option.key, tile.coverage[i], tile.light[i]));
    }
  }
  return pixels;
};
// Measure the painted silhouette, independently of the texture formula. The
// former fixed-width Pencil/Sketch masks both report zero edge variation here.
const textureHierarchy = [];
for (const size of [4, 12, 24]) for (const smoothing of [0, 100]) {
  const scale = size === 4 ? 4 : 1;
  const path = Array.from({ length: 149 }, (_, i) => ({ x: 24 + i * 4, y: 50 }));
  const rows = (["Brush", "Pencil", "Sketch"] as const).map(variant => {
    const option = { ...options(variant, 255), key: { variant, color: "#ff0000", opacityByte: 255 }, size, smoothing, width: 640 * scale, height: 100 * scale, scaleX: scale, scaleY: scale };
    const pixels = render(path, option), replay = render(path, option);
    const rasterSha = (value: typeof pixels) => createHash("sha256").update(JSON.stringify([...value].sort(([a], [b]) => a.localeCompare(b)))).digest("hex");
    const repeatIdentical = rasterSha(pixels) === rasterSha(replay);
    const edges: number[] = [], widths: number[] = [];
    let detached = 0, painted = 0, centerlineGaps = 0;
    const alpha = (x: number, y: number) => pixels.get(`${x}:${y}`)?.coverage ?? 0;
    for (let x = 60 * scale; x < 580 * scale; x++) {
      const ys: number[] = [];
      for (let y = 0; y < option.height; y++) if (alpha(x, y) >= 26) ys.push(y);
      edges.push(ys[0] / scale); widths.push((ys.at(-1)! - ys[0] + 1) / scale);
      if (alpha(x, 50 * scale) !== 255) centerlineGaps++;
      let top = 50 * scale - 1, bottom = 50 * scale;
      while (top > 0 && alpha(x, top) >= 26) top--;
      while (bottom < option.height && alpha(x, bottom) >= 26) bottom++;
      detached += ys.filter(y => y < top || y > bottom).length; painted += ys.length;
    }
    const sd = (values: number[]) => { const mean = values.reduce((a, b) => a + b, 0) / values.length; return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length); };
    check(repeatIdentical && centerlineGaps === 0, `texture stable coherent ${variant}/${size}/${smoothing}`);
    const fractionalInkPixels = [...pixels.values()].filter(pixel => pixel.coverage !== 255).length;
    const wrongPigmentPixels = [...pixels.values()].filter(pixel => compositeRasterPaint(pixel).slice(0, 3).join() !== "255,0,0").length;
    if (variant !== "Brush") check(fractionalInkPixels === 0 && wrongPigmentPixels === 0, `opaque selected-red texture including every detached mark ${variant}/${size}/${smoothing}`);
    return { variant, edgeSd: sd(edges), widthSd: sd(widths), detachedFraction: detached / painted, centerlineGaps, repeatIdentical, fractionalInkPixels, wrongPigmentPixels };
  });
  const [brush, pencil, sketch] = rows;
  check(brush.edgeSd === 0 && brush.widthSd === 0 && brush.detachedFraction === 0, `texture smooth Brush ${size}/${smoothing}`);
  check(pencil.edgeSd >= size * .025 && pencil.detachedFraction < .02, `texture lightly rough Pencil ${size}/${smoothing}`);
  check(sketch.edgeSd >= Math.max(size * .08, pencil.edgeSd * 2) && sketch.widthSd >= pencil.widthSd * 2, `texture rougher Sketch ${size}/${smoothing}`);
  check(sketch.detachedFraction >= .02 && sketch.detachedFraction >= pencil.detachedFraction + .015, `texture scattered Sketch ${size}/${smoothing}`);
  textureHierarchy.push({ size, smoothing, scale, seed: 173, alphaThreshold: 26, rows });
}
const tinyTextureDots = [];
for (const variant of ["Pencil", "Sketch"] as const) for (const scale of [.5, 1, 2]) for (const opacityByte of [26, 128, 255]) for (const fx of [0, .25, .5, .75]) for (const fy of [0, .25, .5, .75]) {
  const pixels = render([{ x: 8 + fx, y: 8 + fy }], { ...options(variant, opacityByte), size: 1, width: 16 * scale, height: 16 * scale, scaleX: scale, scaleY: scale });
  const wrongOpacityPixels = [...pixels.values()].filter(pixel => pixel.coverage !== opacityByte || compositeRasterPaint(pixel)[3] !== opacityByte).length;
  check(pixels.size > 0 && wrongOpacityPixels === 0, `tiny solid texture dot ${variant}/${scale}/${opacityByte}/${fx}/${fy}`);
  tinyTextureDots.push({ variant, scale, opacityByte, fx, fy, paintedPixels: pixels.size, wrongOpacityPixels });
}
const coverage: unknown[] = [];
for (const variant of variants) for (const opacity of [.1, .5]) for (const [scenario, trajectory] of [["repeat", "straight-line"], ["offset", "straight-line"], ["circle", "circle"], ["figure-eight", "figure-eight"], ["reverse-join", "reverse-join"], ["fast-slow", "straight-line"], ["texture", "straight-line"]]) {
  const option = options(variant, Math.round(opacity * 255)), path = points(trajectory), pixels = render(path, option);
  for (let pass = 0; pass < 3; pass++) {
    const replay = scenario === "fast-slow" ? sample([path[0], path.at(-1)!], pass % 2 ? 37 : .8) : path;
    const incoming = render(replay.map(p => ({ x: p.x, y: p.y + (scenario === "offset" ? pass : 0) })), option);
    for (const [key, pixel] of incoming) pixels.set(key, mergePaintPixel(pixels.get(key) ?? null, [0, 0, 0, 0], option.key, pixel.coverage, 0));
  }
  const maximumCoverage = Math.max(0, ...[...pixels.values()].map(p => p.coverage));
  const fullCoverage = Math.max(0, ...[...pixels.values()].map(p => compositeRasterPaint(p)[3]));
  check(maximumCoverage === option.key.opacityByte && fullCoverage === option.key.opacityByte, `${variant}:${scenario}:${opacity} exact coverage`);
  const samples = Array.from({ length: 250 }, (_, i) => pixels.get(`${30 + i}:100`)?.coverage ?? 0);
  let beadExcess = 0;
  if (scenario === "texture") for (let i = 1; i < samples.length - 1; i++) beadExcess = Math.max(beadExcess, samples[i] - Math.max(samples[i - 1], samples[i + 1]));
  check(beadExcess <= 1, `${variant}:${opacity}: no isolated centerline alpha beads`);
  const partialCoveragePixels = [...pixels.values()].filter(pixel => pixel.coverage !== option.key.opacityByte || compositeRasterPaint(pixel)[3] !== option.key.opacityByte).length;
  if (variant === "Pencil" || variant === "Sketch") check(partialCoveragePixels === 0, `${variant}:${scenario}:${opacity} every texture mark uses configured opacity`);
  coverage.push({ variant, scenario, opacity, maximumCoverage, fullCoverage, beadExcess, partialCoveragePixels });
}
const mechanics: unknown[] = [];
const incrementalGeometry: unknown[] = [];
for (const size of [1, 8, 24, 48]) for (const smoothing of [0, 1, 25, 50, 75, 100]) {
  for (const trajectory of fixture.trajectories as { id: string; points: RasterPoint[] }[]) {
    const draft = new RasterGestureDraft({ ...options("Brush"), size, smoothing, width: 1, height: 1 });
    const prefix: RasterPoint[] = [];
    for (const point of trajectory.points) {
      prefix.push(point);
      const preview = draft.append(point)!;
      check(JSON.stringify(preview.centerline) === JSON.stringify(smoothCenterline(canonicalSamples(prefix, size), smoothing)), `incremental geometry ${size}/${smoothing}/${trajectory.id}/${prefix.length}`);
    }
  }
}
const nativeHypot = Math.hypot, nativeExp = Math.exp;
let hypotCalls = 0, expCalls = 0;
try {
  Math.hypot = (...values: number[]) => { hypotCalls++; return nativeHypot(...values); };
  Math.exp = (value: number) => { expCalls++; return nativeExp(value); };
  const draft = new RasterGestureDraft({ ...options("Brush"), width: 1, height: 1 });
  for (let i = 0; i < 2049; i++) {
    hypotCalls = 0; expCalls = 0;
    draft.append({ x: 100 + i, y: 100 });
    if ([33, 129, 513, 1025, 2049].includes(i + 1)) {
      incrementalGeometry.push({ acceptedSamples: i + 1, hypotCalls, expCalls });
      check(expCalls <= 252 && hypotCalls <= 32, `bounded geometry work at ${i + 1} samples`);
    }
  }
  expCalls = 0; draft.append({ x: 2148, y: 100 }); draft.seal();
  check(expCalls === 0, "stationary sample and seal perform no filter work");
} finally { Math.hypot = nativeHypot; Math.exp = nativeExp; }
for (const size of [1, 8, 48]) {
  const path = [{ x: 4.1234, y: 3.8765 }, { x: 4.124, y: 3.877 }, { x: 20.0004, y: 8.0003 }];
  const canonical = canonicalSamples(path, size), reference = sample([{ x: 4.123, y: 3.877 }, { x: 20, y: 8 }], Math.min(6, Math.max(.75, size / 8)));
  check(JSON.stringify(canonical) === JSON.stringify(reference), `canonical rounding/coalescing/resampling size ${size}`);
}
for (const bad of [NaN, Infinity, -Infinity]) {
  assert.throws(() => canonicalSamples([{ x: bad, y: 0 }], 8)); assertions++;
}
for (const variant of variants) {
  const noPaint = render(points("straight-line"), options(variant, 0));
  check(noPaint.size === 0, `${variant}: fully transparent no-op`);
  const first = mergePaintPixel(null, [31, 67, 103, 190], options(variant, 26).key, 26, 0);
  for (const change of [ { ...first.key, color: "#ff3300" }, { ...first.key, opacityByte: 128 }, { ...first.key, variant: variant === "Brush" ? "Pencil" as const : "Brush" as const } ]) {
    const collapsed = compositeRasterPaint(first), next = mergePaintPixel(first, collapsed, change, change.opacityByte, 0);
    check(JSON.stringify(next.base) === JSON.stringify(collapsed), `${variant}: different paint collapses actual base`);
    check(JSON.stringify(compositeRasterPaint(next)) !== JSON.stringify(collapsed), `${variant}: different paint changes pixels`);
    const repeat = mergePaintPixel(next, compositeRasterPaint(next), change, change.opacityByte, 0);
    check(JSON.stringify(repeat) === JSON.stringify(next), `${variant}: new paint repeat is exact`);
  }
  const draft = new RasterGestureDraft(options(variant));
  const previews: { centerline: RasterPoint[]; settled: number }[] = [];
  for (const point of points("noisy-line")) {
    const preview = draft.append(point)!;
    const previous = previews.at(-1);
    if (previous) check(JSON.stringify(preview.centerline.slice(0, previous.settled)) === JSON.stringify(previous.centerline.slice(0, previous.settled)), `${variant}: stable centerline prefix`);
    previews.push({ centerline: preview.centerline.map(p => ({ ...p })), settled: Math.max(0, preview.centerline.length - 14) });
  }
  const stationary = draft.append(points("noisy-line").at(-1)!)!;
  const maskDigest = () => createHash("sha256").update(JSON.stringify([stationary.centerline, ...[stationary.stable, stationary.tail].map(mask => [...mask.tiles.values()].map(tile => [tile.x, tile.y, Array.from(tile.coverage), Array.from(tile.light)]))])).digest("hex");
  const before = maskDigest();
  for (let frame = 0; frame < 10; frame++) { draft.append(points("noisy-line").at(-1)!); check(maskDigest() === before, `${variant}: stationary step ${frame}`); }
  draft.seal(); check(maskDigest() === before, `${variant}: seal exact centerline/coverage/light digest`);
  mechanics.push({ variant, zeroOpacityPixels: noPaint.size, stablePrefixSamples: previews.length, stationarySteps: 10, beforeDigest: before, sealedDigest: maskDigest() });
}
// Independent segment/closed-cell intersection oracle (slab clipping), including
// grid-edge paths and exact corner crossings in both traversal directions.
const intersects = (a: RasterPoint, b: RasterPoint, x: number, y: number, cell: number) => {
  let low = 0, high = 1;
  for (const [p, delta, min, max] of [[a.x, b.x - a.x, x * cell, (x + 1) * cell], [a.y, b.y - a.y, y * cell, (y + 1) * cell]]) {
    if (delta === 0) { if (p < min || p > max) return false; }
    else { const t0 = (min - p) / delta, t1 = (max - p) / delta; low = Math.max(low, Math.min(t0, t1)); high = Math.min(high, Math.max(t0, t1)); }
  }
  return high >= low && high > 1e-8 && low < 1 - 1e-8;
};
let gaps = 0, partialCells = 0;
const pixelateCases = [ [[20, 21], [221, 72]], [[20, 20], [220, 220]], [[8, 16], [80, 16]], [[16, 8], [16, 80]], [[80, 16], [8, 16]] ];
for (const pair of pixelateCases) {
  const [a, b] = pair.map(([x, y]) => ({ x, y }));
  const actual = new Set(supercover(a, b, 8).map(cell => cell.join(":")));
  for (let y = Math.floor(Math.min(a.y, b.y) / 8) - 1; y <= Math.floor(Math.max(a.y, b.y) / 8); y++) for (let x = Math.floor(Math.min(a.x, b.x) / 8) - 1; x <= Math.floor(Math.max(a.x, b.x) / 8); x++) if (intersects(a, b, x, y, 8) && !actual.has(`${x}:${y}`)) gaps++;
}
const terminalCorners = [
  { a: [.1, 1.1], b: [1, 1], cells: [[0, 1], [1, 1]] },
  { a: [1.1, .1], b: [1, 1], cells: [[1, 0], [1, 1]] },
  { a: [.1, 1.1], b: [1, 1 + 1e-7], cells: [[0, 1], [1, 1]] },
  { a: [.1, 1.1], b: [1, 1 - 1e-7], cells: [[0, 1], [0, 0], [1, 0]] },
  { a: [1.1, .1], b: [1 + 1e-7, 1], cells: [[1, 0], [1, 1]] },
  { a: [1.1, .1], b: [1 - 1e-7, 1], cells: [[1, 0], [0, 0], [0, 1]] },
];
for (const cell of [1, 8]) for (const { a, b, cells: expected } of terminalCorners) for (const reverse of [false, true]) {
  const pair = (reverse ? [b, a] : [a, b]).map(([x, y]) => ({ x: x * cell, y: y * cell }));
  const actual = supercover(pair[0], pair[1], cell);
  check(JSON.stringify(actual) === JSON.stringify(reverse ? expected.toReversed() : expected), `Pixelate terminal corner exact ownership ${cell}/${JSON.stringify(pair)}`);
  for (let y = -1; y <= 2; y++) for (let x = -1; x <= 2; x++) if (intersects(pair[0], pair[1], x, y, cell) && !actual.some(p => p[0] === x && p[1] === y)) gaps++;
}
for (const cell of [1, 8]) for (const pair of [[[0, 0], [1, 1]], [[0, 1], [1, 0]], [[0, 1], [2, 1]], [[1, 0], [1, 2]], [[1, 1], [1, 1]]]) for (const reverse of [false, true]) {
  const [a, b] = (reverse ? pair.toReversed() : pair).map(([x, y]) => ({ x: x * cell, y: y * cell }));
  const actual = supercover(a, b, cell);
  for (let y = -1; y <= 2; y++) for (let x = -1; x <= 2; x++) if (intersects(a, b, x, y, cell) && !actual.some(p => p[0] === x && p[1] === y)) gaps++;
  check(actual.length <= 16, "Pixelate exact-corner/edge/dot traversal terminates within its bounded extent");
}
for (const opacity of [0, 26, 128, 255]) for (const reverse of [false, true]) {
  const pair = [{ x: 4.1, y: 5.1 }, { x: 5, y: 5 }];
  const pixels = render(reverse ? pair.toReversed() : pair, { ...options("Pixelate", opacity), size: 1, smoothing: 0, width: 16, height: 16 });
  check(pixels.size === (opacity ? 2 : 0), "Pixelate terminal-corner actual draft paints exactly the endpoint-owned cells");
  for (const key of ["4:5", "5:5"]) check((pixels.get(key)?.coverage ?? 0) === opacity, "Pixelate terminal-corner configured alpha survives preview/seal");
}
const pixelatePixels = render(points("pixelate-slopes"), { ...options("Pixelate"), smoothing: 0 });
const cells = new Map<string, number[]>();
for (const [key, pixel] of pixelatePixels) { const [x, y] = key.split(":").map(Number), cell = `${Math.floor(x / 8)}:${Math.floor(y / 8)}`; const list = cells.get(cell) ?? []; list.push(pixel.coverage); cells.set(cell, list); }
for (const values of cells.values()) if (values.length !== 64 || values.some(v => v !== 26)) partialCells++;
const pixelateAlpha = new Set<number>();
for (let y = 0; y < 350; y++) for (let x = 0; x < 250; x++) pixelateAlpha.add(pixelatePixels.get(`${x}:${y}`)?.coverage ?? 0);
const pixelate = { gaps, rotatedCells: 0, partialCells, alphaValues: [...pixelateAlpha].sort((a, b) => a - b), cases: pixelateCases, terminalCorners };
check(gaps === 0, "true closed-grid supercover connectivity"); check(partialCells === 0, "axis-aligned full integer cells at exact configured alpha");
const linear = (v: number) => (v / 255 <= .04045 ? v / 255 / 12.92 : ((v / 255 + .055) / 1.055) ** 2.4);
const luminance = (rgb: number[]) => .2126 * linear(rgb[0]) + .7152 * linear(rgb[1]) + .0722 * linear(rgb[2]);
// Independently scan every final centerline segment for each pixel. This checks
// Glow's accelerated distance search without reproducing its tree or pruning.
const glowDistanceOracle: unknown[] = [];
const smallPaths = [
  Array.from({ length: 41 }, (_, i) => ({ x: 2 + i, y: 10 + i / 2 })),
  Array.from({ length: 49 }, (_, i) => ({ x: 24 + 17 * Math.cos(i * Math.PI / 24), y: 20 + 13 * Math.sin(i * Math.PI / 24) })),
  Array.from({ length: 41 }, (_, i) => ({ x: 3 + i, y: 20 + 14 * Math.sin(i / 4) })),
  Array.from({ length: 41 }, (_, i) => ({ x: 3 + (i <= 20 ? i * 2 : 80 - i * 2), y: 20 + (i % 2) * .001 })),
];
for (const [pathIndex, path] of smallPaths.entries()) for (const size of [1, 8, 24, 48]) for (const brightness of [0, 50, 100]) for (const radius of [0, 50, 100]) {
  const scales = [[.4, .6], [1, 1], [1.4, .8]][(pathIndex + radius / 50) % 3];
  const option = { ...options("Glow", brightness === 50 ? 26 : 255), size, smoothing: 0, brightness, radius, width: 48, height: 40, scaleX: scales[0], scaleY: scales[1] };
  const draft = new RasterGestureDraft(option);
  for (const point of path) draft.append(point);
  const final = draft.seal()!;
  const actual = new Uint8Array(option.width * option.height * 2), expected = new Uint8Array(actual.length);
  for (let y = 0; y < option.height; y++) for (let x = 0; x < option.width; x++) {
    const index = (y * option.width + x) * 2, a = final.stable.get(x, y), b = final.tail.get(x, y);
    actual[index] = Math.max(a[0], b[0]); actual[index + 1] = Math.max(a[1], b[1]);
    const px = (x + .5) / option.scaleX, py = (y + .5) / option.scaleY;
    let nearest = Infinity;
    for (let i = 1; i < final.centerline.length; i++) {
      const from = final.centerline[i - 1], to = final.centerline[i];
      const dx = to.x - from.x, dy = to.y - from.y;
      const t = Math.min(1, Math.max(0, ((px - from.x) * dx + (py - from.y) * dy) / (dx * dx + dy * dy || 1)));
      nearest = Math.min(nearest, Math.hypot(px - (from.x + t * dx), py - (from.y + t * dy)));
    }
    const core = Math.max(.5, size / 2), aa = .5 / Math.max(option.scaleX, option.scaleY);
    const extent = brightness > 0 ? Math.min(128, Math.max(8, size * 8), core + 4 + radius / 100 * size * 7) : core;
    const q = Math.min(1, Math.max(0, (extent - nearest) / Math.max(.001, extent - core)));
    const cover = Math.max(Math.min(1, Math.max(0, (core + aa - nearest) / (2 * aa))), brightness > 0 ? q ** 1.25 * brightness / 100 : 0);
    expected[index] = Math.round(cover * option.key.opacityByte);
    expected[index + 1] = expected[index] && brightness > 0 ? Math.round(255 * brightness / 100 * .72 * Math.max(q, cover)) : 0;
  }
  check(Buffer.from(actual).equals(Buffer.from(expected)), `Glow exact brute-distance field ${pathIndex}/${size}/${brightness}/${radius}/${scales}`);
  glowDistanceOracle.push({ pathIndex, size, brightness, radius, scales, pixels: option.width * option.height, actualSha: createHash("sha256").update(actual).digest("hex"), expectedSha: createHash("sha256").update(expected).digest("hex") });
}
const glow: unknown[] = [];
for (const [background, grey] of [["dark-neutral", 24], ["mid-neutral", 96]] as const) {
  const rows = [0, 50, 100].map(brightness => {
    const option = { ...options("Glow", 255), brightness, size: 8, radius: 50 };
    const pixels = render([{ x: 200, y: 300 }, { x: 400, y: 300 }], option);
    const bg = luminance([grey, grey, grey]); let sum = 0, count = 0, peakHaloLift = 0, corePeakLinearLuminance = 0, haloExtent = 0;
    let hueRecognizable = true;
    for (let y = 170; y < 430; y++) for (let x = 230; x < 370; x++) {
      const p = pixels.get(`${x}:${y}`), d = Math.abs(y + .5 - 300);
      const rgba = p ? compositeRasterPaint({ ...p, base: [grey, grey, grey, 255] }) : [grey, grey, grey, 255];
      const lum = luminance(rgba);
      if (d >= 8 && d <= 20) { sum += lum - bg; count++; peakHaloLift = Math.max(peakHaloLift, lum - bg); }
      if (d <= 2) { corePeakLinearLuminance = Math.max(corePeakLinearLuminance, lum); hueRecognizable &&= rgba[1] > rgba[0] && rgba[2] > rgba[0]; }
      if (p) haloExtent = Math.max(haloExtent, d);
    }
    const row = { background, brightness, annulusMeanLinearLift: sum / count, peakHaloLift, coreContrast: (corePeakLinearLuminance + .05) / (bg + .05), corePeakLinearLuminance, hueRecognizable, haloExtent, size: option.size, radius: option.radius, color: option.key.color, opacityByte: 255, annulus: [8, 20] };
    glow.push(row); return row;
  });
  check(rows[0].haloExtent <= 4.5, `${background}: zero halo`);
  check(rows[1].annulusMeanLinearLift >= .08 && rows[1].coreContrast >= 3, `${background}: mid glow`);
  check(rows[2].annulusMeanLinearLift >= .18 && rows[2].peakHaloLift >= rows[1].peakHaloLift * 1.5 && rows[2].corePeakLinearLuminance >= .75, `${background}: max glow`);
}
const output = "output/spec-0007/phase-1/raster-oracle.json";
mkdirSync("output/spec-0007/phase-1", { recursive: true });
const report = { status: failures.length ? "FAIL" : "PASS", scope: "Independent raster oracle only; complete phase requires all producer receipts.", assertions, failures, smoothing, textureHierarchy, tinyTextureDots, coverage, glow, glowDistanceOracle, mechanics, incrementalGeometry, pixelate,
  runtimeSha: createHash("sha256").update(readFileSync("src/lib/animation/editorCommands/rasterGesture.ts")).digest("hex"),
  remaining: ["command malformed mutations", "stationary ten-frame browser proof", "bound producer receipt"] };
writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
writeUnitResult("raster", sourceDigestBefore, report, assertions, failures);
console.log(JSON.stringify(report));
if (failures.length) process.exitCode = 1;
