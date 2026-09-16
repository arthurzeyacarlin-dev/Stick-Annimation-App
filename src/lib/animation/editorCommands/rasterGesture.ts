import { assertRasterPaintCoverageV1, cropPaintCoverage, getBitmapPaintCoverage, mergeSketchOwners, paintCoveragesEqual, type UnifiedRasterPaintCoverageV1, type RasterPaintKeyV1, type RasterPaintPixelV1 } from '../unifiedRasterPaintCoverageV1.ts';
import { bitmapCenterOffset } from '../unifiedStageGeometry.ts';

/** Deterministic authoring geometry and maximum masks. No browser or clock state. */
export type RasterPoint = { x: number; y: number };
export type RasterRect = { left: number; top: number; width: number; height: number };
export type RasterGestureOptions = {
  key: RasterPaintKeyV1; size: number; smoothing: number; brightness: number;
  radius: number; seed: number; width: number; height: number; scaleX: number; scaleY: number;
};
export const RASTER_GESTURE_COMMAND = 'drawing.raster-gesture.commit/v2';
export const RASTER_ALGORITHM_VERSION = 'continuous-maxmask/v3';
export type RasterGestureCommandV2 = {
  commandId: typeof RASTER_GESTURE_COMMAND;
  operationId: string;
  contextKey: string;
  baseGeneration: number;
  preparedGeneration: number;
  erase: boolean;
  options: RasterGestureOptions;
  samples: readonly RasterPoint[];
  tiles: Array<RasterRect & { before: Uint8ClampedArray; after: Uint8ClampedArray }>;
  algorithmVersion: typeof RASTER_ALGORITHM_VERSION;
  baseCoverage: UnifiedRasterPaintCoverageV1 | null;
  preparedCoverage: UnifiedRasterPaintCoverageV1 | null;
  baseDigest: string;
  preparedDigest: string;
};

/** Versioned target digest, paired with exact byte/coverage comparison at commit. */
const byteDigest = (bytes: ArrayLike<number>) => {
  let a = 2166136261, b = 2246822519;
  for (let i = 0; i < bytes.length; i++) { a = Math.imul(a ^ bytes[i], 16777619); b = Math.imul(b ^ bytes[i], 3266489917); }
  return `${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`;
};
const coverageDigests = new WeakMap<UnifiedRasterPaintCoverageV1, string>();
const coverageDigest = (coverage: UnifiedRasterPaintCoverageV1 | null) => {
  if (!coverage) return 'none';
  let digest = coverageDigests.get(coverage);
  if (!digest) {
    digest = byteDigest(new TextEncoder().encode(JSON.stringify([coverage.version, coverage.width, coverage.height,
      coverage.tiles.map(tile => [tile.x, tile.y, tile.palette, byteDigest(tile.runs)])])));
    coverageDigests.set(coverage, digest);
  }
  return digest;
};
export function rasterCommandDigest(tiles: RasterGestureCommandV2['tiles'], side: 'before' | 'after', coverage: UnifiedRasterPaintCoverageV1 | null): string {
  return `raster-target/v1:${byteDigest(new TextEncoder().encode(JSON.stringify([
    tiles.map(tile => [tile.left, tile.top, tile.width, tile.height, byteDigest(tile[side])]), coverageDigest(coverage),
  ])))}`;
}
function validOptions(options: RasterGestureOptions) {
  return options && [options.size, options.smoothing, options.brightness, options.radius, options.width, options.height, options.scaleX, options.scaleY, options.seed].every(Number.isFinite) &&
    ['Brush', 'Pencil', 'Sketch', 'Pixelate', 'Glow'].includes(options.key?.variant) && /^#[0-9a-f]{6}$/.test(options.key?.color) &&
    Number.isSafeInteger(options.key.opacityByte) && options.key.opacityByte >= 0 && options.key.opacityByte <= 255 &&
    options.size > 0 && options.size <= 2048 && options.smoothing >= 0 && options.smoothing <= 100 && options.brightness >= 0 && options.brightness <= 100 && options.radius >= 0 && options.radius <= 100 &&
    options.scaleX > 0 && options.scaleY > 0 && Number.isFinite(options.size * options.scaleX * options.scaleY) && Number.isSafeInteger(options.seed) && options.seed >= 0 && options.seed <= 0xffffffff &&
    Number.isSafeInteger(options.width) && Number.isSafeInteger(options.height) && options.width > 0 && options.height > 0 && options.width * options.height * 4 <= 268435456;
}

function hasCommonPigmentLight(selected: ArrayLike<number>, retained: ArrayLike<number> | null, prepared: ArrayLike<number>, lightMax: number, retainedOffset = 0, preparedOffset = 0): boolean {
  let low = 0, high = lightMax;
  for (let channel = 0; channel < 3; channel++) {
    const source = selected[channel], previous = retained?.[retainedOffset + channel] ?? 0, value = prepared[preparedOffset + channel];
    if (value < Math.max(source, previous)) return false;
    if (source === 255) { if (value !== 255) return false; continue; }
    const step = 2 * (255 - source);
    // Intersect the integer light values producing all three rounded channels.
    // A retained maximum also permits smaller incoming channel values.
    high = Math.min(high, Math.floor((255 * (2 * (value - source) + 1) - 1) / step));
    if (value > previous) low = Math.max(low, Math.ceil(255 * (2 * (value - source) - 1) / step));
    if (low > high) return false;
  }
  return low <= high;
}

/** Compare actual captured base bytes; a digest collision cannot authorize a patch. */
export function validateRasterGestureCommand(
  command: RasterGestureCommandV2,
  current: { contextKey: string; generation: number; bitmap: { width: number; height: number; data: Uint8ClampedArray } | null },
): boolean {
  // A command is an untrusted boundary even for the current manual caller.
  // Malformed nested values and detached buffers reject without escaping.
  try {
  if (!command || command.commandId !== RASTER_GESTURE_COMMAND || command.algorithmVersion !== RASTER_ALGORITHM_VERSION || !command.operationId || !validOptions(command.options) ||
      typeof command.operationId !== 'string' || typeof command.erase !== 'boolean' || !Array.isArray(command.samples) || !Array.isArray(command.tiles) ||
      command.contextKey !== current.contextKey || command.preparedGeneration !== current.generation ||
      !Number.isSafeInteger(command.preparedGeneration) ||
      command.preparedGeneration !== command.baseGeneration + 1 || !Number.isSafeInteger(command.baseGeneration) ||
      command.baseGeneration < 0 || !command.samples.length || !command.tiles.length) return false;
  for (let i = 0; i < command.samples.length; i++) {
    const point = command.samples[i];
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || Math.abs(point.x) > 1048576 || Math.abs(point.y) > 1048576 ||
      point.x !== Math.round(point.x * 1000) / 1000 || point.y !== Math.round(point.y * 1000) / 1000 ||
      i > 0 && Math.hypot(point.x - command.samples[i - 1].x, point.y - command.samples[i - 1].y) < .25) return false;
  }
  const { width, height } = command.options;
  if (command.baseCoverage !== null) assertRasterPaintCoverageV1(command.baseCoverage, width, height);
  if (command.preparedCoverage !== null) assertRasterPaintCoverageV1(command.preparedCoverage, width, height);
  const offsetX = current.bitmap ? bitmapCenterOffset(width, current.bitmap.width) : 0;
  const offsetY = current.bitmap ? bitmapCenterOffset(height, current.bitmap.height) : 0;
  const storedCoverage = getBitmapPaintCoverage(current.bitmap);
  const visibleCoverage = current.bitmap && (current.bitmap.width !== width || current.bitmap.height !== height)
    ? cropPaintCoverage(storedCoverage, -offsetX, -offsetY, width, height) : storedCoverage;
  if (!paintCoveragesEqual(visibleCoverage, command.baseCoverage) ||
    command.preparedCoverage && (command.preparedCoverage.width !== width || command.preparedCoverage.height !== height) ||
    command.baseDigest !== rasterCommandDigest(command.tiles, 'before', command.baseCoverage) ||
    command.preparedDigest !== rasterCommandDigest(command.tiles, 'after', command.preparedCoverage)) return false;
  const seen = new Set<string>();
  const equalBytes = (a: ArrayLike<number>, b: ArrayLike<number>) => {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  };
  const equalRange = (a: ArrayLike<number>, aOffset: number, b: ArrayLike<number>, bOffset: number, length: number) => {
    for (let i = 0; i < length; i++) if (a[aOffset + i] !== b[bOffset + i]) return false;
    return true;
  };
  const read16 = (bytes: Uint8Array, offset: number) => bytes[offset] | bytes[offset + 1] << 8;
  const baseTiles = new Map(command.baseCoverage?.tiles.map(tile => [`${tile.x}:${tile.y}`, tile]));
  const preparedTiles = new Map(command.preparedCoverage?.tiles.map(tile => [`${tile.x}:${tile.y}`, tile]));
  const selectedPigment = [1, 3, 5].map(offset => Number.parseInt(command.options.key.color.slice(offset, offset + 2), 16));
  const lightMax = command.options.key.variant === 'Glow' ? Math.round(255 * command.options.brightness / 100 * .72) : 0;
  for (const tile of command.tiles) {
    const key = `${tile.left}:${tile.top}`;
    if (seen.has(key) || !(tile.before instanceof Uint8ClampedArray) || !(tile.after instanceof Uint8ClampedArray) || ![tile.left, tile.top, tile.width, tile.height].every(Number.isSafeInteger) ||
        tile.left < 0 || tile.top < 0 || tile.left % 32 !== 0 || tile.top % 32 !== 0 || tile.width !== Math.min(32, width - tile.left) || tile.height !== Math.min(32, height - tile.top) ||
        tile.left + tile.width > width || tile.top + tile.height > height ||
        tile.before.length !== tile.width * tile.height * 4 || tile.after.length !== tile.before.length) return false;
    seen.add(key);
    // Index independently validated RLE bytes directly. This avoids allocating
    // a key, pixel, and several arrays for every Glow gradient pixel while
    // retaining the same per-pixel base, composite, and no-loss checks.
    const decode = (tiles: typeof baseTiles) => {
      const encoded = tiles.get(key);
      if (!encoded) return null;
      const offsets = new Int32Array(1024).fill(-1);
      for (let offset = 0; offset < encoded.runs.length; offset += 14) {
        const start = read16(encoded.runs, offset);
        offsets.fill(offset, start, start + read16(encoded.runs, offset + 2));
      }
      return { ...encoded, offsets };
    };
    const previousPixels = decode(baseTiles), preparedPixels = decode(preparedTiles);
    for (let y = 0; y < tile.height; y++) for (let x = 0; x < tile.width; x++) {
      const sx = tile.left + x - offsetX, sy = tile.top + y - offsetY;
      const source = current.bitmap && sx >= 0 && sy >= 0 && sx < current.bitmap.width && sy < current.bitmap.height ? (sy * current.bitmap.width + sx) * 4 : -1;
      const target = (y * tile.width + x) * 4;
      for (let channel = 0; channel < 4; channel++) if (tile.before[target + channel] !== (source >= 0 ? current.bitmap!.data[source + channel] : 0)) return false;
      const previousOffset = previousPixels?.offsets[y * 32 + x] ?? -1, preparedOffset = preparedPixels?.offsets[y * 32 + x] ?? -1;
      const previousKey = previousOffset >= 0 ? previousPixels!.palette[read16(previousPixels!.runs, previousOffset + 4)] : null;
      const preparedKey = preparedOffset >= 0 ? preparedPixels!.palette[read16(preparedPixels!.runs, preparedOffset + 4)] : null;
      const equalPixel = previousOffset < 0 && preparedOffset < 0 || Boolean(previousKey && preparedKey && samePaint(previousKey, preparedKey) && equalRange(previousPixels!.runs, previousOffset + 6, preparedPixels!.runs, preparedOffset + 6, 8));
      if (equalRange(tile.before, target, tile.after, target, 4) && equalPixel) continue;
      if (command.erase) {
        if (preparedKey || tile.after[target + 3] > tile.before[target + 3] || (tile.after[target + 3] ? !equalRange(tile.after, target, tile.before, target, 3) : tile.after[target] !== 0 || tile.after[target + 1] !== 0 || tile.after[target + 2] !== 0)) return false;
      } else {
        if (!command.options.key.opacityByte || !preparedKey || !samePaint(preparedKey, command.options.key) || tile.after[target + 3] < tile.before[target + 3]) return false;
        const runs = preparedPixels!.runs, amount = runs[preparedOffset + 10], same = previousKey && samePaint(previousKey, preparedKey);
        if (amount > command.options.key.opacityByte || !equalRange(runs, preparedOffset + 6, same ? previousPixels!.runs : tile.before, same ? previousOffset + 6 : target, 4) || same && amount < previousPixels!.runs[previousOffset + 10]) return false;
        const baseAlpha = runs[preparedOffset + 9], alpha = amount + baseAlpha * (255 - amount) / 255;
        if (Math.round(alpha) !== tile.after[target + 3]) return false;
        for (let channel = 0; channel < 3; channel++) if (Math.round((runs[preparedOffset + 11 + channel] * amount + runs[preparedOffset + 6 + channel] * baseAlpha * (255 - amount) / 255) / alpha) !== tile.after[target + channel]) return false;
        if (!hasCommonPigmentLight(selectedPigment, same ? previousPixels!.runs : null, runs, lightMax, previousOffset + 11, preparedOffset + 11)) return false;
      }
    }
  }
  const outside = (value: UnifiedRasterPaintCoverageV1 | null) => (value?.tiles ?? []).filter(tile => !seen.has(`${tile.x}:${tile.y}`));
  const oldOutside = outside(command.baseCoverage), nextOutside = outside(command.preparedCoverage);
  if (oldOutside.length !== nextOutside.length || oldOutside.some((tile, i) => {
    const next = nextOutside[i];
    return tile.x !== next.x || tile.y !== next.y || JSON.stringify(tile.palette) !== JSON.stringify(next.palette) || !equalBytes(tile.runs, next.runs);
  })) return false;
  return true;
  } catch { return false; }
}
const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v));
const round = (v: number) => Math.round(v * 1000) / 1000;
const distance = (a: RasterPoint, b: RasterPoint) => Math.hypot(b.x - a.x, b.y - a.y);
export const samePaint = (a: RasterPaintKeyV1, b: RasterPaintKeyV1) =>
  a.variant === b.variant && a.color === b.color && a.opacityByte === b.opacityByte;
export const canonicalPaint = (variant: RasterPaintKeyV1['variant'], color: string, transparency: number): RasterPaintKeyV1 => {
  if (!/^#[0-9a-f]{6}$/i.test(color) || !Number.isFinite(transparency) || transparency < 0 || transparency > 100) throw new Error('invalid_paint');
  return { variant, color: color.toLowerCase(), opacityByte: Math.round(255 * (100 - transparency) / 100) };
};
export function canonicalSamples(input: readonly RasterPoint[], size: number): RasterPoint[] {
  const points: RasterPoint[] = [];
  for (const inputPoint of input) {
    if (!Number.isFinite(inputPoint.x) || !Number.isFinite(inputPoint.y)) throw new Error('invalid_sample');
    const point = { x: round(inputPoint.x), y: round(inputPoint.y) };
    if (!points.length || distance(points[points.length - 1], point) >= .25) points.push(point);
  }
  if (points.length < 2) return points;
  const spacing = clamp(Math.max(.75, size / 8), .75, 6);
  const out = [points[0]];
  let remainder = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], length = distance(a, b);
    for (let along = spacing - remainder; along <= length + 1e-9; along += spacing) {
      const t = clamp(along / length, 0, 1);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
    remainder = (remainder + length) % spacing;
    if (remainder < 1e-9 || spacing - remainder < 1e-9) remainder = 0;
  }
  const end = points[points.length - 1];
  if (distance(out[out.length - 1], end) > 1e-7) out.push(end);
  return out;
}
function smoothPointAt(raw: readonly RasterPoint[], smoothing: number, index: number): RasterPoint {
  const point = raw[index];
  if (smoothing === 0 || raw.length < 3 || index === 0 || index === raw.length - 1) return { ...point };
  const strength = smoothing / 100;
  const sigma = .4 + strength * 3.6;
  const radius = Math.ceil(sigma * 2.5);
  let sumX = 0, sumY = 0, total = 0;
  for (let j = index - radius; j <= index + radius; j++) {
    const weight = Math.exp(-.5 * ((index - j) / sigma) ** 2);
    // Reflect around endpoint positions. Truncating the filter pulls the
    // first/last interior samples inward and can reverse a tight spiral.
    const reflected = j < 0
      ? { x: 2 * raw[0].x - raw[Math.min(-j, raw.length - 1)].x, y: 2 * raw[0].y - raw[Math.min(-j, raw.length - 1)].y }
      : j >= raw.length
        ? { x: 2 * raw[raw.length - 1].x - raw[Math.max(0, 2 * (raw.length - 1) - j)].x, y: 2 * raw[raw.length - 1].y - raw[Math.max(0, 2 * (raw.length - 1) - j)].y }
        : raw[j];
    sumX += reflected.x * weight; sumY += reflected.y * weight; total += weight;
  }
  return { x: point.x * (1 - strength) + sumX / total * strength, y: point.y * (1 - strength) + sumY / total * strength };
}
export function smoothCenterline(raw: readonly RasterPoint[], smoothing: number): RasterPoint[] {
  return raw.map((_point, index) => smoothPointAt(raw, smoothing, index));
}
function curveSegment(points: readonly RasterPoint[], i: number, smooth: boolean): RasterPoint[] {
  const b = points[i], c = points[Math.min(i + 1, points.length - 1)];
  if (!smooth) return [b, c];
  const a = points[Math.max(0, i - 1)], d = points[Math.min(i + 2, points.length - 1)];
  const steps = Math.max(2, Math.ceil(distance(b, c) / .5));
  const out = [b];
  for (let step = 1; step <= steps; step++) {
    const t = step / steps, t2 = t * t, t3 = t2 * t;
    const coordinate = (key: 'x' | 'y') => .5 * ((2 * b[key]) + (-a[key] + c[key]) * t + (2 * a[key] - 5 * b[key] + 4 * c[key] - d[key]) * t2 + (-a[key] + 3 * b[key] - 3 * c[key] + d[key]) * t3);
    out.push({ x: coordinate('x'), y: coordinate('y') });
  }
  return out;
}
export function renderedCenterline(input: readonly RasterPoint[], size: number, smoothing: number): RasterPoint[] {
  const points = smoothCenterline(canonicalSamples(input, size), smoothing);
  if (points.length < 2) return points;
  return points.slice(0, -1).flatMap((_, i) => curveSegment(points, i, smoothing > 0).slice(i === 0 ? 0 : 1));
}
const TILE = 32;
export type MaskTile = { x: number; y: number; coverage: Uint8Array; light: Uint8Array };
export class MaximumMask {
  readonly tiles = new Map<number, MaskTile>();
  bounds: RasterRect | null = null;
  readonly width: number;
  readonly height: number;
  constructor(width: number, height: number) { this.width = width; this.height = height; }
  set(x: number, y: number, coverage: number, light: number) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height || coverage <= 0) return;
    const tx = Math.floor(x / TILE) * TILE, ty = Math.floor(y / TILE) * TILE, key = ty / TILE * Math.ceil(this.width / TILE) + tx / TILE;
    let tile = this.tiles.get(key);
    if (!tile) { tile = { x: tx, y: ty, coverage: new Uint8Array(TILE * TILE), light: new Uint8Array(TILE * TILE) }; this.tiles.set(key, tile); }
    const i = (y - ty) * TILE + x - tx;
    tile.coverage[i] = Math.max(tile.coverage[i], coverage); tile.light[i] = Math.max(tile.light[i], light);
    if (!this.bounds) this.bounds = { left: x, top: y, width: 1, height: 1 };
    else { const right = Math.max(this.bounds.left + this.bounds.width, x + 1), bottom = Math.max(this.bounds.top + this.bounds.height, y + 1); this.bounds.left = Math.min(this.bounds.left, x); this.bounds.top = Math.min(this.bounds.top, y); this.bounds.width = right - this.bounds.left; this.bounds.height = bottom - this.bounds.top; }
  }
  get(x: number, y: number): [number, number] {
    const tx = Math.floor(x / TILE) * TILE, ty = Math.floor(y / TILE) * TILE;
    const tile = this.tiles.get(ty / TILE * Math.ceil(this.width / TILE) + tx / TILE), i = (y - ty) * TILE + x - tx;
    return tile ? [tile.coverage[i], tile.light[i]] : [0, 0];
  }
}
export function unionRect(a: RasterRect | null, b: RasterRect | null): RasterRect | null {
  if (!a) return b ? { ...b } : null;
  if (!b) return { ...a };
  const left = Math.min(a.left, b.left), top = Math.min(a.top, b.top);
  return { left, top, width: Math.max(a.left + a.width, b.left + b.width) - left, height: Math.max(a.top + a.height, b.top + b.height) - top };
}
/** Includes both cells when a line crosses an exact grid corner. */
export function supercover(a: RasterPoint, b: RasterPoint, cellSize: number): Array<[number, number]> {
  let x = Math.floor(a.x / cellSize), y = Math.floor(a.y / cellSize);
  const endX = Math.floor(b.x / cellSize), endY = Math.floor(b.y / cellSize);
  const cells: Array<[number, number]> = [[x, y]];
  const dx = b.x - a.x, dy = b.y - a.y, sx = Math.sign(dx), sy = Math.sign(dy);
  const deltaX = dx === 0 ? Infinity : cellSize / Math.abs(dx), deltaY = dy === 0 ? Infinity : cellSize / Math.abs(dy);
  let nextX = dx === 0 ? Infinity : ((sx > 0 ? x + 1 : x) * cellSize - a.x) / dx;
  let nextY = dy === 0 ? Infinity : ((sy > 0 ? y + 1 : y) * cellSize - a.y) / dy;
  while (x !== endX || y !== endY) {
    // At a terminal mixed-sign corner one axis can already own its endpoint
    // cell. Never step that finished axis past the target at the tied crossing.
    const crossX = x === endX ? Infinity : nextX, crossY = y === endY ? Infinity : nextY;
    if (Math.abs(crossX - crossY) < 1e-10) { cells.push([x + sx, y], [x, y + sy]); x += sx; y += sy; nextX += deltaX; nextY += deltaY; }
    else if (crossX < crossY) { x += sx; nextX += deltaX; } else { y += sy; nextY += deltaY; }
    cells.push([x, y]);
    if (cells.length > 1000000) throw new Error('gesture_extent_limit');
  }
  // A path on a grid edge touches the cells on both sides for its full
  // length. Corner traversal alone does not cover these parallel cases.
  if (dx === 0 && Number.isInteger(a.x / cellSize)) {
    for (const [cx, cy] of cells.slice()) cells.push([cx - 1, cy]);
  }
  if (dy === 0 && Number.isInteger(a.y / cellSize)) {
    for (const [cx, cy] of cells.slice()) cells.push([cx, cy - 1]);
  }
  return cells;
}
// Smooth, seeded paper grain in authoring coordinates. It is independent of
// event count, time and the mutable preview tail, including at tile boundaries.
function paperGrainHash(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function paperGrain(x: number, y: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const tx = fx * fx * (3 - 2 * fx), ty = fy * fy * (3 - 2 * fy);
  return (paperGrainHash(ix, iy, seed) * (1 - tx) + paperGrainHash(ix + 1, iy, seed) * tx) * (1 - ty)
    + (paperGrainHash(ix, iy + 1, seed) * (1 - tx) + paperGrainHash(ix + 1, iy + 1, seed) * tx) * ty;
}
function stamp(mask: MaximumMask, path: RasterPoint[], options: RasterGestureOptions) {
  if (!path.length) return;
  const { key, size, scaleX, scaleY } = options;
  if (key.variant === 'Pixelate') {
    const cell = Math.max(1, Math.round(size));
    const cells = new Map<string, [number, number]>();
    for (let i = 0; i < Math.max(1, path.length - 1); i++) for (const [cx, cy] of supercover(path[i], path[Math.min(i + 1, path.length - 1)], cell)) cells.set(`${cx}:${cy}`, [cx, cy]);
    for (const [cx, cy] of cells.values()) {
      const left = Math.round(cx * cell * scaleX), top = Math.round(cy * cell * scaleY);
      const right = Math.round((cx + 1) * cell * scaleX), bottom = Math.round((cy + 1) * cell * scaleY);
      for (let y = Math.max(0, top); y < Math.min(mask.height, bottom); y++) for (let x = Math.max(0, left); x < Math.min(mask.width, right); x++) mask.set(x, y, key.opacityByte, 0);
    }
    return;
  }
  const pencil = key.variant === 'Pencil', sketch = key.variant === 'Sketch', glow = key.variant === 'Glow';
  const core = Math.max(.5, size * .5);
  const brightness = options.brightness / 100;
  // A solid texture must reach a pixel even when a tiny tap lands at a pixel
  // corner. Larger brushes keep their authored silhouette unchanged.
  const minimumTextureRadius = pencil || sketch ? .5 * Math.hypot(1 / scaleX, 1 / scaleY) : 0;
  const extent = glow && brightness > 0 ? Math.min(128, Math.max(8, size * 8), core + 4 + options.radius / 100 * size * 7) : Math.max(core * (pencil ? 1.25 : sketch ? 2.1 : 1), minimumTextureRadius);
  const aa = .5 / Math.max(scaleX, scaleY);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const point of path) { minX = Math.min(minX, point.x); minY = Math.min(minY, point.y); maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y); }
  const left = Math.max(0, Math.floor((minX - extent - aa) * scaleX));
  const top = Math.max(0, Math.floor((minY - extent - aa) * scaleY));
  const right = Math.min(mask.width, Math.ceil((maxX + extent + aa) * scaleX));
  const bottom = Math.min(mask.height, Math.ceil((maxY + extent + aa) * scaleY));
  const segments = path.length === 1 ? [{ a: path[0], dx: 0, dy: 0, inverse: 0 }] : path.slice(1).map((b, i) => {
    const a = path[i], dx = b.x - a.x, dy = b.y - a.y;
    return { a, dx, dy, inverse: 1 / (dx * dx + dy * dy || 1) };
  });
  type DistanceNode = { minX: number; minY: number; maxX: number; maxY: number; start: number; end: number; skip: number };
  const distanceNodes: DistanceNode[] = [];
  const buildDistanceNode = (start: number, end: number) => {
    const node: DistanceNode = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, start: -1, end: -1, skip: 0 };
    distanceNodes.push(node);
    for (let i = start; i < end; i++) {
      const { a, dx, dy } = segments[i], bx = a.x + dx, by = a.y + dy;
      node.minX = Math.min(node.minX, a.x, bx); node.minY = Math.min(node.minY, a.y, by);
      node.maxX = Math.max(node.maxX, a.x, bx); node.maxY = Math.max(node.maxY, a.y, by);
    }
    const pad = 64 * Number.EPSILON * Math.max(1, Math.abs(node.minX), Math.abs(node.minY), Math.abs(node.maxX), Math.abs(node.maxY));
    node.minX -= pad; node.minY -= pad; node.maxX += pad; node.maxY += pad;
    if (end - start <= 4) { node.start = start; node.end = end; }
    else { const middle = (start + end) >>> 1; buildDistanceNode(start, middle); buildDistanceNode(middle, end); }
    node.skip = distanceNodes.length;
  };
  if (segments.length >= 8) buildDistanceNode(0, segments.length);
  const searchNodes = glow ? new Int32Array(distanceNodes.length) : null;
  const searchBounds = glow ? new Float64Array(distanceNodes.length) : null;
  let nearestSegment = 0;
  const solidRadius = pencil || sketch ? Math.max(core * (pencil ? .75 : .5), minimumTextureRadius) : Math.max(0, core - aa);
  const grainScale = Math.max(1, size * (pencil ? .25 : .38));
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
    const px = (x + .5) / scaleX, py = (y + .5) / scaleY;
    let distanceSquared = Infinity;
    if (distanceNodes.length && searchNodes && searchBounds) {
      // Adjacent pixels usually share a nearest segment. Its exact projection
      // gives a tight initial bound; the tree still checks every possible
      // improvement, including at crossings and on the next row.
      const seed = segments[nearestSegment];
      const seedT = clamp(((px - seed.a.x) * seed.dx + (py - seed.a.y) * seed.dy) * seed.inverse, 0, 1);
      const seedX = px - seed.a.x - seedT * seed.dx, seedY = py - seed.a.y - seedT * seed.dy;
      distanceSquared = seedX * seedX + seedY * seedY;
      // Glow visits the nearer child first so long paths do not repeatedly
      // tighten the distance through every earlier segment. Bounds only prune;
      // the surviving projections and radial paint formula remain exact.
      let pending = distanceSquared <= solidRadius * solidRadius ? 0 : 1;
      searchNodes[0] = 0; searchBounds[0] = 0;
      while (pending > 0) {
        pending--;
        if (searchBounds[pending] > distanceSquared) continue;
        const nodeIndex = searchNodes[pending], node = distanceNodes[nodeIndex];
        if (node.start < 0) {
          const firstIndex = nodeIndex + 1, secondIndex = distanceNodes[firstIndex].skip;
          const first = distanceNodes[firstIndex], second = distanceNodes[secondIndex];
          const ax = px < first.minX ? first.minX - px : px > first.maxX ? px - first.maxX : 0;
          const ay = py < first.minY ? first.minY - py : py > first.maxY ? py - first.maxY : 0;
          const bx = px < second.minX ? second.minX - px : px > second.maxX ? px - second.maxX : 0;
          const by = py < second.minY ? second.minY - py : py > second.maxY ? py - second.maxY : 0;
          const firstBound = ax * ax + ay * ay, secondBound = bx * bx + by * by;
          const firstNearer = firstBound <= secondBound;
          searchNodes[pending] = firstNearer ? secondIndex : firstIndex;
          searchBounds[pending++] = firstNearer ? secondBound : firstBound;
          searchNodes[pending] = firstNearer ? firstIndex : secondIndex;
          searchBounds[pending++] = firstNearer ? firstBound : secondBound;
          continue;
        }
        for (let i = node.start; i < node.end; i++) {
          const { a, dx, dy, inverse } = segments[i];
          const t = clamp(((px - a.x) * dx + (py - a.y) * dy) * inverse, 0, 1);
          const vx = px - a.x - t * dx, vy = py - a.y - t * dy;
          const projected = vx * vx + vy * vy;
          if (projected < distanceSquared) { distanceSquared = projected; nearestSegment = i; }
          if (distanceSquared <= solidRadius * solidRadius) break;
        }
        // Every Glow hit inside this radius has identical full core paint.
        if (distanceSquared <= solidRadius * solidRadius) break;
      }
    } else if (distanceNodes.length) {
      // Visit surviving segments in their original order, preserving the exact
      // projection arithmetic and first solid-core hit. Skip only boxes that
      // cannot improve the current distance; no pixel/path approximation.
      let nodeIndex = 0;
      while (nodeIndex < distanceNodes.length) {
        const node = distanceNodes[nodeIndex];
        const bx = px < node.minX ? node.minX - px : px > node.maxX ? px - node.maxX : 0;
        const by = py < node.minY ? node.minY - py : py > node.maxY ? py - node.maxY : 0;
        if (bx * bx + by * by > distanceSquared) { nodeIndex = node.skip; continue; }
        for (let i = node.start; i >= 0 && i < node.end; i++) {
          const { a, dx, dy, inverse } = segments[i];
          const t = clamp(((px - a.x) * dx + (py - a.y) * dy) * inverse, 0, 1);
          const vx = px - a.x - t * dx, vy = py - a.y - t * dy;
          distanceSquared = Math.min(distanceSquared, vx * vx + vy * vy);
          if (distanceSquared <= solidRadius * solidRadius) break;
        }
        if (distanceSquared <= solidRadius * solidRadius) break;
        nodeIndex++;
      }
    } else {
      for (const { a, dx, dy, inverse } of segments) {
        const t = clamp(((px - a.x) * dx + (py - a.y) * dy) * inverse, 0, 1);
        const vx = px - a.x - t * dx, vy = py - a.y - t * dy;
        distanceSquared = Math.min(distanceSquared, vx * vx + vy * vy);
        if (distanceSquared <= solidRadius * solidRadius) break;
      }
    }
    const dist = Math.sqrt(distanceSquared);
    let coverage = clamp((core + aa - dist) / (2 * aa), 0, 1), light = 0;
    if (glow && brightness > 0) {
      const q = clamp((extent - dist) / Math.max(.001, extent - core), 0, 1);
      coverage = Math.max(coverage, Math.pow(q, 1.25) * brightness);
      light = Math.round(255 * brightness * .72 * Math.max(q, coverage));
    }
    if (pencil || sketch) {
      if (dist <= solidRadius) coverage = 1;
      else {
        const edge = paperGrain(px / (grainScale * 2.3), py / (grainScale * 2.3), options.seed);
        const grain = paperGrain(px / grainScale, py / grainScale, options.seed + 59);
        const roughRadius = core * (pencil ? .75 + .5 * edge : .5 + edge);
        // Texture is solid geometric occupancy, never opacity modulation.
        // Every occupied Pencil/Sketch pixel uses the selected opacity exactly;
        // the irregular silhouette and detached Sketch blobs supply texture.
        coverage = dist <= roughRadius || sketch && dist <= extent && grain >= .66 ? 1 : 0;
      }
    }
    mask.set(x, y, Math.min(key.opacityByte, Math.round(coverage * key.opacityByte)), light);
  }
}
// The centerline is a live view; settled point objects retain their identity.
export type RasterPreview = { stable: MaximumMask; tail: MaximumMask; changed: RasterRect | null; centerline: RasterPoint[] };
export class RasterGestureDraft {
  readonly points: RasterPoint[] = [];
  readonly stable: MaximumMask;
  readonly options: RasterGestureOptions;
  private settledSegments = 0;
  private oldTail: RasterRect | null = null;
  private lastPreview: RasterPreview | null = null;
  private terminal = false;
  private raw: RasterPoint[] = [];
  private centerline: RasterPoint[] = [];
  private regularRawCount = 0;
  private resampleRemainder = 0;
  private spacing: number;
  private smoothingRadius: number;
  constructor(options: RasterGestureOptions) {
    if (!validOptions(options)) throw new Error('invalid_gesture_options');
    this.options = { ...options, key: { ...options.key } };
    this.spacing = clamp(Math.max(.75, options.size / 8), .75, 6);
    this.smoothingRadius = options.smoothing === 0 ? 0 : Math.ceil((.4 + options.smoothing / 100 * 3.6) * 2.5);
    this.stable = new MaximumMask(options.width, options.height);
  }
  append(point: RasterPoint): RasterPreview | null {
    if (this.terminal) return this.lastPreview;
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error('invalid_sample');
    const next = { x: round(point.x), y: round(point.y) };
    const previous = this.points[this.points.length - 1];
    if (previous && distance(previous, next) < .25) return this.lastPreview;
    const changedRawStart = this.regularRawCount;
    this.points.push(next);
    // Remove only the provisional endpoint, then resample the new segment.
    this.raw.length = this.regularRawCount;
    if (!previous) this.raw.push(next);
    else {
      const length = distance(previous, next);
      for (let along = this.spacing - this.resampleRemainder; along <= length + 1e-9; along += this.spacing) {
        const t = clamp(along / length, 0, 1);
        this.raw.push({ x: previous.x + (next.x - previous.x) * t, y: previous.y + (next.y - previous.y) * t });
      }
      this.resampleRemainder = (this.resampleRemainder + length) % this.spacing;
      if (this.resampleRemainder < 1e-9 || this.spacing - this.resampleRemainder < 1e-9) this.resampleRemainder = 0;
    }
    this.regularRawCount = this.raw.length;
    if (distance(this.raw[this.raw.length - 1], next) > 1e-7) this.raw.push(next);
    this.centerline.length = this.raw.length;
    for (let i = Math.max(0, changedRawStart - this.smoothingRadius); i < this.raw.length; i++) {
      this.centerline[i] = smoothPointAt(this.raw, this.options.smoothing, i);
    }
    const centerline = this.centerline;
    const lag = this.options.smoothing === 0 ? 2 : Math.ceil((.4 + this.options.smoothing / 100 * 3.6) * 2.5) + 3;
    const nextSettled = Math.max(0, centerline.length - lag);
    const changedStable = new MaximumMask(this.options.width, this.options.height);
    const render = (mask: MaximumMask, start: number, end: number) => {
      const path: RasterPoint[] = [];
      for (let i = start; i < end; i++) {
        const curve = curveSegment(centerline, i, this.options.smoothing > 0);
        path.push(...curve.slice(path.length ? 1 : 0));
      }
      stamp(mask, path, this.options);
    };
    render(changedStable, this.settledSegments, nextSettled);
    for (const [key, tile] of changedStable.tiles) {
      const retained = this.stable.tiles.get(key);
      if (!retained) this.stable.tiles.set(key, tile);
      else for (let i = 0; i < TILE * TILE; i++) {
        retained.coverage[i] = Math.max(retained.coverage[i], tile.coverage[i]);
        retained.light[i] = Math.max(retained.light[i], tile.light[i]);
      }
    }
    this.stable.bounds = unionRect(this.stable.bounds, changedStable.bounds);
    this.settledSegments = nextSettled;
    const tail = new MaximumMask(this.options.width, this.options.height);
    if (centerline.length === 1) stamp(tail, [centerline[0]], this.options);
    else render(tail, this.settledSegments, centerline.length - 1);
    const changed = unionRect(unionRect(changedStable.bounds, tail.bounds), this.oldTail);
    this.oldTail = tail.bounds;
    this.lastPreview = { stable: this.stable, tail, changed, centerline };
    return this.lastPreview;
  }
  seal(): RasterPreview | null { if (this.terminal) return null; this.terminal = true; return this.lastPreview; }
  cancel() { this.terminal = true; this.lastPreview = null; this.stable.tiles.clear(); }
}
const pigmentSources = new Map<string, readonly number[]>();
export function mergePaintPixel(previous: RasterPaintPixelV1 | null, base: ArrayLike<number>, key: RasterPaintKeyV1, incomingCoverage: number, light: number, destination?: RasterPaintPixelV1, baseOffset = 0, ownerId?: string): RasterPaintPixelV1 {
  const same = previous && samePaint(previous.key, key);
  const coverage = Math.min(key.opacityByte, Math.max(same ? previous.coverage : 0, incomingCoverage));
  let source = pigmentSources.get(key.color);
  if (!source) {
    source = [Number.parseInt(key.color.slice(1, 3), 16), Number.parseInt(key.color.slice(3, 5), 16), Number.parseInt(key.color.slice(5, 7), 16)];
    if (pigmentSources.size >= 128) pigmentSources.delete(pigmentSources.keys().next().value!);
    pigmentSources.set(key.color, source);
  }
  const pixel: RasterPaintPixelV1 = destination ?? { key, base: [0, 0, 0, 0], coverage, pigment: [0, 0, 0] };
  const retainedBase = same ? previous.base : base, offset = same ? 0 : baseOffset;
  for (let i = 0; i < 3; i++) pixel.pigment[i] = Math.max(same ? previous.pigment[i] : 0, Math.round(source[i] + (255 - source[i]) * light / 255));
  for (let i = 0; i < 4; i++) pixel.base[i] = retainedBase[offset + i];
  pixel.key = key; pixel.coverage = coverage;
  const owners = key.variant === 'Sketch' ? mergeSketchOwners(same ? previous.owners : undefined, ownerId ? [ownerId] : undefined) : undefined;
  if (owners) pixel.owners = owners; else delete pixel.owners;
  return pixel;
}
export function compositeRasterPaint(pixel: RasterPaintPixelV1): [number, number, number, number];
export function compositeRasterPaint(pixel: RasterPaintPixelV1, destination: Uint8ClampedArray, offset: number): Uint8ClampedArray;
export function compositeRasterPaint(pixel: RasterPaintPixelV1, destination?: Uint8ClampedArray, offset = 0): [number, number, number, number] | Uint8ClampedArray {
  const a = pixel.coverage, ba = pixel.base[3], alpha = a + ba * (255 - a) / 255;
  const result = destination ?? [0, 0, 0, 0] as [number, number, number, number];
  for (let i = 0; i < 3; i++) result[offset + i] = alpha === 0 ? 0 : Math.round((pixel.pigment[i] * a + pixel.base[i] * ba * (255 - a) / 255) / alpha);
  result[offset + 3] = Math.round(alpha);
  return result;
}
