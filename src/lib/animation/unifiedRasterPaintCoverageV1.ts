/** Internal raster provenance. It is immutable after finish and is not a stroke/object model. */
export type RasterPaintKeyV1 = {
  variant: "Brush" | "Pencil" | "Sketch" | "Pixelate" | "Glow";
  color: string;
  opacityByte: number;
};

export type RasterPaintPixelV1 = {
  key: RasterPaintKeyV1;
  base: [number, number, number, number];
  coverage: number;
  pigment: [number, number, number];
  /** Exact contributors to the current Sketch paint run; never part of the same-paint key. */
  owners?: string[];
};

export type RasterPaintCoverageTileV1 = {
  x: number;
  y: number;
  palette: (RasterPaintKeyV1 & { owners?: string[] })[];
  /** LE start:u16, length:u16, palette:u16, base:RGBA, coverage:u8, pigment:RGB. */
  runs: Uint8Array;
};

export type UnifiedRasterPaintCoverageV1 = {
  version: 1 | 2;
  width: number;
  height: number;
  tileSize: 32;
  tiles: RasterPaintCoverageTileV1[];
};

export type RasterPaintCoverageRectV1 = { x: number; y: number; width: number; height: number };
const TILE_SIZE = 32;
const RECORD_BYTES = 14;
const MAX_BYTES = 268_435_456;
const variants = new Set(["Brush", "Pencil", "Sketch", "Pixelate", "Glow"]);
const associations = new WeakMap<object, UnifiedRasterPaintCoverageV1 | null>();
const tileIndexes = new WeakMap<UnifiedRasterPaintCoverageV1, Map<string, RasterPaintCoverageTileV1>>();
const invalid = (): never => { throw new Error("invalid_record"); };
const record = (value: unknown) => value !== null && typeof value === "object" && !Array.isArray(value) && !ArrayBuffer.isView(value);
const integer = (value: number, min: number, max: number) => Number.isSafeInteger(value) && !Object.is(value, -0) && value >= min && value <= max;
const exactKeys = (value: object, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const byte = (value: number) => integer(value, 0, 255);
const byteTuple = (value: unknown, length: number) => {
  if (!Array.isArray(value) || value.length !== length) return false;
  for (let i = 0; i < length; i++) if (!Object.hasOwn(value, i) || !byte(value[i])) return false;
  return true;
};
const keyText = (key: RasterPaintKeyV1) => `${key.variant}:${key.color}:${key.opacityByte}`;
const ownerText = (value: { owners?: string[] }) => value.owners?.join(",") ?? "";
const paletteText = (key: RasterPaintKeyV1 & { owners?: string[] }) => keyText(key) + (key.owners ? `:${ownerText(key)}` : "");
const assertOwners = (owners: string[] | undefined, variant: string) => {
  if (owners === undefined) return;
  if (variant !== "Sketch" || !Array.isArray(owners) || !owners.length || owners.length > 4096) invalid();
  let previous = "";
  for (const owner of owners) {
    if (typeof owner !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(owner) || owner <= previous) invalid();
    previous = owner;
  }
};
export const mergeSketchOwners = (left: string[] | undefined, right: string[] | undefined) => {
  if (!left) return right?.slice();
  if (!right) return left.slice();
  return [...new Set([...left, ...right])].sort();
};
const coverageVersion = (tiles: RasterPaintCoverageTileV1[]): 1 | 2 => tiles.some(tile => tile.palette.some(key => key.owners)) ? 2 : 1;
const assertDimensions = (width: number, height: number) => {
  if (!integer(width, 1, MAX_BYTES / 4) || !integer(height, 1, MAX_BYTES / 4) || width * height * 4 > MAX_BYTES) invalid();
};
const assertKey = (key: RasterPaintKeyV1) => {
  if (!record(key) || !exactKeys(key, ["variant", "color", "opacityByte"]) || !variants.has(key.variant) ||
    !/^#[0-9a-f]{6}$/.test(key.color) || !integer(key.opacityByte, 1, 255)) invalid();
};
const assertPixel = (pixel: RasterPaintPixelV1) => {
  if (!record(pixel) || !exactKeys(pixel, ["key", "base", "coverage", "pigment", ...(pixel.owners ? ["owners"] : [])])) invalid();
  assertKey(pixel.key);
  assertOwners(pixel.owners, pixel.key.variant);
  if (!byteTuple(pixel.base, 4) || !byteTuple(pixel.pigment, 3) ||
    !integer(pixel.coverage, 1, pixel.key.opacityByte)) invalid();
};
const clonePixel = (pixel: RasterPaintPixelV1, ownedKey?: RasterPaintKeyV1): RasterPaintPixelV1 => ({
  key: ownedKey ?? { ...pixel.key }, base: [...pixel.base], coverage: pixel.coverage, pigment: [...pixel.pigment],
  ...(pixel.owners ? { owners: pixel.owners.slice() } : {}),
});
const pixelsEqual = (a: RasterPaintPixelV1, b: RasterPaintPixelV1) => a === b ||
  a.coverage === b.coverage && a.key.variant === b.key.variant && a.key.color === b.key.color && a.key.opacityByte === b.key.opacityByte &&
  a.base[0] === b.base[0] && a.base[1] === b.base[1] && a.base[2] === b.base[2] && a.base[3] === b.base[3] &&
  a.pigment[0] === b.pigment[0] && a.pigment[1] === b.pigment[1] && a.pigment[2] === b.pigment[2] && ownerText(a) === ownerText(b);
const u16 = (bytes: Uint8Array, offset: number) => bytes[offset] | (bytes[offset + 1] << 8);
const set16 = (bytes: Uint8Array, offset: number, value: number) => { bytes[offset] = value & 255; bytes[offset + 1] = value >>> 8; };
const readPixel = (tile: RasterPaintCoverageTileV1, offset: number): RasterPaintPixelV1 => {
  const entry = tile.palette[u16(tile.runs, offset + 4)];
  return {
  key: { variant: entry.variant, color: entry.color, opacityByte: entry.opacityByte },
  base: [tile.runs[offset + 6], tile.runs[offset + 7], tile.runs[offset + 8], tile.runs[offset + 9]],
  coverage: tile.runs[offset + 10],
  pigment: [tile.runs[offset + 11], tile.runs[offset + 12], tile.runs[offset + 13]],
  ...(entry.owners ? { owners: entry.owners.slice() } : {}),
}; };
const indexTiles = (coverage: UnifiedRasterPaintCoverageV1) => {
  let index = tileIndexes.get(coverage);
  if (!index) {
    index = new Map(coverage.tiles.map(tile => [`${tile.x}:${tile.y}`, tile]));
    tileIndexes.set(coverage, index);
  }
  return index;
};

export function assertRasterPaintCoverageV1(value: UnifiedRasterPaintCoverageV1, width = value?.width, height = value?.height) {
  if (!record(value) || !exactKeys(value, ["version", "width", "height", "tileSize", "tiles"]) || ![1, 2].includes(value.version) || value.tileSize !== TILE_SIZE ||
    value.width !== width || value.height !== height || !Array.isArray(value.tiles)) invalid();
  assertDimensions(width, height);
  let previousOrder = -1;
  let byteLength = 32;
  const columnCount = Math.ceil(width / TILE_SIZE);
  for (const tile of value.tiles) {
    if (!record(tile) || !exactKeys(tile, ["x", "y", "palette", "runs"]) || !integer(tile.x, 0, width - 1) || !integer(tile.y, 0, height - 1) ||
      tile.x % TILE_SIZE !== 0 || tile.y % TILE_SIZE !== 0 || !Array.isArray(tile.palette) || tile.palette.length < 1 || tile.palette.length > 1024 ||
      !(tile.runs instanceof Uint8Array) || tile.runs.length < RECORD_BYTES || tile.runs.length > 1024 * RECORD_BYTES || tile.runs.length % RECORD_BYTES !== 0) invalid();
    const order = (tile.y / TILE_SIZE) * columnCount + tile.x / TILE_SIZE;
    if (order <= previousOrder) invalid();
    previousOrder = order;
    let previousKey = "";
    for (const key of tile.palette) {
      if (!record(key) || !exactKeys(key, ["variant", "color", "opacityByte", ...(key.owners ? ["owners"] : [])]) || value.version === 1 && key.owners) invalid();
      assertKey({ variant: key.variant, color: key.color, opacityByte: key.opacityByte });
      assertOwners(key.owners, key.variant);
      const text = paletteText(key);
      if (text <= previousKey) invalid();
      previousKey = text;
      byteLength += text.length + 24;
    }
    byteLength += tile.runs.byteLength + 24;
    if (byteLength > MAX_BYTES) invalid();
    const used = new Set<number>();
    let previousEnd = 0;
    for (let offset = 0; offset < tile.runs.length; offset += RECORD_BYTES) {
      const start = u16(tile.runs, offset);
      const length = u16(tile.runs, offset + 2);
      const paletteIndex = u16(tile.runs, offset + 4);
      if (start < previousEnd || length < 1 || start + length > 1024 || paletteIndex >= tile.palette.length) invalid();
      // Uint8Array already bounds every payload byte. Palette keys were
      // validated above; avoid allocating/revalidating a pixel for every run.
      const coverage = tile.runs[offset + 10];
      if (coverage < 1 || coverage > tile.palette[paletteIndex].opacityByte) invalid();
      if (offset > 0 && start === previousEnd) {
        let equal = true;
        for (let index = 4; index < RECORD_BYTES; index++) if (tile.runs[offset + index] !== tile.runs[offset - RECORD_BYTES + index]) { equal = false; break; }
        if (equal) invalid();
      }
      const lastPoint = start + length - 1;
      const crossesRow = Math.floor(start / TILE_SIZE) !== Math.floor(lastPoint / TILE_SIZE);
      if (tile.y + Math.floor(lastPoint / TILE_SIZE) >= height || tile.x + (crossesRow ? TILE_SIZE - 1 : lastPoint % TILE_SIZE) >= width) invalid();
      used.add(paletteIndex);
      previousEnd = start + length;
    }
    if (used.size !== tile.palette.length) invalid();
  }
  return value;
}

export const getPaintCoverage = (coverage: UnifiedRasterPaintCoverageV1 | null | undefined, x: number, y: number): RasterPaintPixelV1 | null => {
  if (!coverage || !integer(x, 0, coverage.width - 1) || !integer(y, 0, coverage.height - 1)) return null;
  const tile = indexTiles(coverage).get(`${Math.floor(x / TILE_SIZE) * TILE_SIZE}:${Math.floor(y / TILE_SIZE) * TILE_SIZE}`);
  if (!tile) return null;
  const point = (y - tile.y) * TILE_SIZE + x - tile.x;
  let low = 0, high = tile.runs.length / RECORD_BYTES - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    const offset = middle * RECORD_BYTES;
    const start = u16(tile.runs, offset);
    if (point < start) high = middle - 1;
    else if (point >= start + u16(tile.runs, offset + 2)) low = middle + 1;
    else return readPixel(tile, offset);
  }
  return null;
};

export const forEachPaintCoverage = (
  coverage: UnifiedRasterPaintCoverageV1 | null | undefined,
  visit: (pixel: RasterPaintPixelV1, x: number, y: number) => void,
  bounds?: RasterPaintCoverageRectV1,
) => {
  if (!coverage) return;
  for (const tile of coverage.tiles) {
    if (bounds && (tile.x >= bounds.x + bounds.width || tile.y >= bounds.y + bounds.height || tile.x + TILE_SIZE <= bounds.x || tile.y + TILE_SIZE <= bounds.y)) continue;
    for (let offset = 0; offset < tile.runs.length; offset += RECORD_BYTES) {
      const start = u16(tile.runs, offset), end = start + u16(tile.runs, offset + 2);
      const pixel = readPixel(tile, offset);
      for (let point = start; point < end; point += 1) {
        const x = tile.x + point % TILE_SIZE, y = tile.y + Math.floor(point / TILE_SIZE);
        if (!bounds || x >= bounds.x && y >= bounds.y && x < bounds.x + bounds.width && y < bounds.y + bounds.height) visit(pixel, x, y);
      }
    }
  }
};

/** Select one exact Sketch contributor intersected by the cut, never by proximity. */
export const resolveSketchKnifeOwner = (coverage: UnifiedRasterPaintCoverageV1 | null, touched: number[]) => {
  if (!coverage) return null;
  const counts = new Map<string, number>();
  for (const index of touched) {
    const pixel = getPaintCoverage(coverage, index % coverage.width, Math.floor(index / coverage.width));
    for (const owner of pixel?.owners ?? []) counts.set(owner, (counts.get(owner) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
};

/** Copies get fresh contributor identities; transforms/crops keep the original identities. */
export const remapSketchOwners = (coverage: UnifiedRasterPaintCoverageV1 | null, map: (owner: string) => string) => {
  if (!coverage || coverage.version === 1) return coverage;
  const writer = createPaintCoverageWriter(null, coverage.width, coverage.height);
  const ids = new Map<string, string>();
  forEachPaintCoverage(coverage, (pixel, x, y) => {
    const owners = pixel.owners?.map(owner => {
      if (!ids.has(owner)) ids.set(owner, map(owner));
      return ids.get(owner)!;
    }).sort();
    writer.set(x, y, { ...pixel, ...(owners ? { owners } : {}) });
  });
  return writer.finish();
};

const encodeTile = (x: number, y: number, pixels: (RasterPaintPixelV1 | null)[]): RasterPaintCoverageTileV1 | null => {
  const keyMap = new Map<string, RasterPaintKeyV1 & { owners?: string[] }>();
  let previousVariant = "", previousColor = "", previousOpacity = -1, previousText = "";
  const textFor = (key: RasterPaintKeyV1) => {
    if (typeof key.color !== "string") return keyText(key);
    if (key.variant !== previousVariant || key.color !== previousColor || key.opacityByte !== previousOpacity) {
      previousVariant = key.variant; previousColor = key.color; previousOpacity = key.opacityByte; previousText = keyText(key);
    }
    return previousText;
  };
  for (const pixel of pixels) if (pixel) keyMap.set(textFor(pixel.key) + (pixel.owners ? `:${ownerText(pixel)}` : ""), pixel.owners ? { ...pixel.key, owners: pixel.owners.slice() } : pixel.key);
  if (!keyMap.size) return null;
  const keyStrings = [...keyMap.keys()].sort();
  const palette = keyStrings.map(key => ({ ...keyMap.get(key)! }));
  const paletteIndices = new Map(keyStrings.map((key, index) => [key, index]));
  let recordCount = 0;
  for (let point = 0; point < pixels.length; point += 1) {
    const pixel = pixels[point];
    if (!pixel) continue;
    while (point + 1 < pixels.length && pixels[point + 1] && pixelsEqual(pixels[point + 1]!, pixel)) point += 1;
    recordCount++;
  }
  const runs = new Uint8Array(recordCount * RECORD_BYTES);
  let offset = 0;
  for (let point = 0; point < pixels.length; point++) {
    const pixel = pixels[point];
    if (!pixel) continue;
    const start = point;
    while (point + 1 < pixels.length && pixels[point + 1] && pixelsEqual(pixels[point + 1]!, pixel)) point++;
    set16(runs, offset, start); set16(runs, offset + 2, point - start + 1);
    set16(runs, offset + 4, palette.length === 1 ? 0 : paletteIndices.get(textFor(pixel.key) + (pixel.owners ? `:${ownerText(pixel)}` : ""))!);
    for (let channel = 0; channel < 4; channel++) runs[offset + 6 + channel] = pixel.base[channel];
    runs[offset + 10] = pixel.coverage;
    for (let channel = 0; channel < 3; channel++) runs[offset + 11 + channel] = pixel.pigment[channel];
    offset += RECORD_BYTES;
  }
  return { x, y, palette, runs };
};

export const createPaintCoverageWriter = (coverage: UnifiedRasterPaintCoverageV1 | null | undefined, width: number, height: number) => {
  assertDimensions(width, height);
  if (coverage && (coverage.width !== width || coverage.height !== height)) invalid();
  let current = coverage ?? null;
  let original = current ? indexTiles(current) : new Map<string, RasterPaintCoverageTileV1>();
  const changed = new Map<string, { x: number; y: number; pixels: (RasterPaintPixelV1 | null)[] }>();
  let lastOwnedKey: RasterPaintKeyV1 | null = null;
  const locate = (x: number, y: number) => {
    if (!integer(x, 0, width - 1) || !integer(y, 0, height - 1)) invalid();
    const tileX = Math.floor(x / TILE_SIZE) * TILE_SIZE, tileY = Math.floor(y / TILE_SIZE) * TILE_SIZE;
    return { key: `${tileX}:${tileY}`, tileX, tileY, point: (y - tileY) * TILE_SIZE + x - tileX };
  };
  const writable = (location: ReturnType<typeof locate>) => {
    let tile = changed.get(location.key);
    if (!tile) {
      const pixels: (RasterPaintPixelV1 | null)[] = Array(1024).fill(null);
      const source = original.get(location.key);
      if (source) for (let offset = 0; offset < source.runs.length; offset += RECORD_BYTES) {
        const start = u16(source.runs, offset), pixel = readPixel(source, offset);
        pixels.fill(pixel, start, start + u16(source.runs, offset + 2));
      }
      tile = { x: location.tileX, y: location.tileY, pixels };
      changed.set(location.key, tile);
    }
    return tile;
  };
  const readCurrent = (location: ReturnType<typeof locate>, x: number, y: number) => {
    const edited = changed.get(location.key);
    return edited ? edited.pixels[location.point] : getPaintCoverage(current, x, y);
  };
  return {
    get(x: number, y: number) {
      const pixel = readCurrent(locate(x, y), x, y);
      return pixel ? clonePixel(pixel) : null;
    },
    set(x: number, y: number, pixel: RasterPaintPixelV1) {
      assertPixel(pixel);
      const location = locate(x, y);
      const previous = readCurrent(location, x, y);
      if (previous && pixelsEqual(previous, pixel)) return;
      const tile = writable(location);
      // Share only our private immutable copy. Caller values are still fully
      // validated, and get()/finish() return independently owned key records.
      let ownedKey: RasterPaintKeyV1 | undefined;
      if (typeof pixel.key.color === "string") {
        if (!lastOwnedKey || lastOwnedKey.variant !== pixel.key.variant || lastOwnedKey.color !== pixel.key.color || lastOwnedKey.opacityByte !== pixel.key.opacityByte) lastOwnedKey = Object.freeze({ ...pixel.key });
        ownedKey = lastOwnedKey;
      }
      tile.pixels[location.point] = clonePixel(pixel, ownedKey);
    },
    clear(x: number, y: number) {
      const location = locate(x, y);
      if (!readCurrent(location, x, y)) return;
      const tile = writable(location);
      tile.pixels[location.point] = null;
    },
    finish(): UnifiedRasterPaintCoverageV1 | null {
      if (!changed.size) return current;
      const tiles = new Map(original);
      for (const [key, tile] of changed) {
        const encoded = encodeTile(tile.x, tile.y, tile.pixels);
        if (encoded) tiles.set(key, encoded); else tiles.delete(key);
      }
      // Set/clear validate every new record. Old tiles are immutable validated
      // values. Do not replay every old pixel merely to seal another preview.
      let byteLength = 32;
      for (const tile of tiles.values()) {
        byteLength += tile.runs.byteLength + 24;
        for (const key of tile.palette) byteLength += paletteText(key).length + 24;
      }
      if (byteLength > MAX_BYTES) invalid();
      const sorted = [...tiles.values()].sort((a, b) => a.y - b.y || a.x - b.x);
      current = tiles.size ? { version: coverageVersion(sorted), width, height, tileSize: 32, tiles: sorted } : null;
      original = tiles;
      if (current) tileIndexes.set(current, tiles);
      changed.clear();
      return current;
    },
  };
};

export const getBitmapPaintCoverage = (bitmap: object | null | undefined): UnifiedRasterPaintCoverageV1 | null => {
  if (!bitmap) return null;
  if (associations.has(bitmap)) return associations.get(bitmap) ?? null;
  if (Object.prototype.hasOwnProperty.call(bitmap, "paintCoverage")) return (bitmap as { paintCoverage: UnifiedRasterPaintCoverageV1 | null }).paintCoverage;
  return associations.get(bitmap) ?? null;
};
export const attachBitmapPaintCoverage = <T extends object>(bitmap: T, coverage: UnifiedRasterPaintCoverageV1 | null | undefined): T => {
  associations.set(bitmap, coverage ?? null);
  return bitmap;
};
export const copyBitmapPaintCoverage = <T extends object>(source: object | null | undefined, target: T): T =>
  attachBitmapPaintCoverage(target, getBitmapPaintCoverage(source));

export const paintCoveragesEqual = (left: UnifiedRasterPaintCoverageV1 | null | undefined, right: UnifiedRasterPaintCoverageV1 | null | undefined) => {
  if (left === right) return true;
  if (!left || !right) return !left && !right;
  if (left.width !== right.width || left.height !== right.height || left.tiles.length !== right.tiles.length) return false;
  return left.tiles.every((tile, index) => {
    const other = right.tiles[index];
    return tile.x === other.x && tile.y === other.y && tile.palette.length === other.palette.length && tile.runs.length === other.runs.length &&
      tile.palette.every((key, keyIndex) => paletteText(key) === paletteText(other.palette[keyIndex])) && tile.runs.every((byte, byteIndex) => byte === other.runs[byteIndex]);
  });
};

export const cropPaintCoverage = (coverage: UnifiedRasterPaintCoverageV1 | null | undefined, left: number, top: number, width: number, height: number) => {
  assertDimensions(width, height);
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(top)) invalid();
  if (!coverage) return null;
  // A command's aligned dirty rectangle contains complete encoded tiles.
  // Copy those records directly, keeping ownership isolated without decoding
  // and re-encoding every covered pixel several times during release.
  if (left % TILE_SIZE === 0 && top % TILE_SIZE === 0 &&
    (width % TILE_SIZE === 0 || left + width >= coverage.width) && (height % TILE_SIZE === 0 || top + height >= coverage.height)) {
    const tiles = coverage.tiles.filter(tile => tile.x >= left && tile.y >= top && tile.x < left + width && tile.y < top + height)
      .map(tile => ({ x: tile.x - left, y: tile.y - top, palette: tile.palette.map(key => ({ ...key, ...(key.owners ? { owners: key.owners.slice() } : {}) })), runs: tile.runs.slice() }));
    return tiles.length ? assertRasterPaintCoverageV1({ version: coverageVersion(tiles), width, height, tileSize: 32, tiles }) : null;
  }
  const writer = createPaintCoverageWriter(null, width, height);
  forEachPaintCoverage(coverage, (pixel, x, y) => {
    if (x >= left && y >= top && x < left + width && y < top + height) writer.set(x - left, y - top, pixel);
  }, { x: left, y: top, width, height });
  return writer.finish();
};

export const translatePaintCoverage = (coverage: UnifiedRasterPaintCoverageV1 | null | undefined, width: number, height: number, offsetX: number, offsetY: number) => {
  assertDimensions(width, height);
  if (!Number.isSafeInteger(offsetX) || !Number.isSafeInteger(offsetY)) invalid();
  if (!coverage) return null;
  if (width === coverage.width && height === coverage.height && offsetX === 0 && offsetY === 0) return coverage;
  const writer = createPaintCoverageWriter(null, width, height);
  forEachPaintCoverage(coverage, (pixel, x, y) => writer.set(x + offsetX, y + offsetY, pixel));
  return writer.finish();
};

export const patchPaintCoverage = (
  base: UnifiedRasterPaintCoverageV1 | null | undefined,
  patch: UnifiedRasterPaintCoverageV1 | null | undefined,
  left: number, top: number, width: number, height: number,
  targetWidth = base?.width ?? Math.max(left + width, patch?.width ?? 1),
  targetHeight = base?.height ?? Math.max(top + height, patch?.height ?? 1),
) => {
  if (![left, top, width, height].every(Number.isSafeInteger) || left < 0 || top < 0 || width < 1 || height < 1 ||
    left + width > targetWidth || top + height > targetHeight || (patch && (patch.width !== width || patch.height !== height))) invalid();
  const writer = createPaintCoverageWriter(base, targetWidth, targetHeight);
  if (left % TILE_SIZE === 0 && top % TILE_SIZE === 0 &&
    (width % TILE_SIZE === 0 || left + width === targetWidth) && (height % TILE_SIZE === 0 || top + height === targetHeight)) {
    const tiles = (base?.tiles ?? []).filter(tile => tile.x < left || tile.y < top || tile.x >= left + width || tile.y >= top + height)
      .concat((patch?.tiles ?? []).map(tile => ({ x: tile.x + left, y: tile.y + top, palette: tile.palette.map(key => ({ ...key, ...(key.owners ? { owners: key.owners.slice() } : {}) })), runs: tile.runs.slice() })))
      .sort((a, b) => a.y - b.y || a.x - b.x);
    let byteLength = 32;
    for (const tile of tiles) { byteLength += tile.runs.byteLength + 24; for (const key of tile.palette) byteLength += paletteText(key).length + 24; }
    if (byteLength > MAX_BYTES) invalid();
    return tiles.length ? assertRasterPaintCoverageV1({ version: coverageVersion(tiles), width: targetWidth, height: targetHeight, tileSize: 32, tiles }) : null;
  }
  forEachPaintCoverage(base, (_pixel, x, y) => {
    if (x >= left && y >= top && x < left + width && y < top + height) writer.clear(x, y);
  }, { x: left, y: top, width, height });
  forEachPaintCoverage(patch, (pixel, x, y) => writer.set(x + left, y + top, pixel));
  return writer.finish();
};

export const transformPaintCoverage = (
  coverage: UnifiedRasterPaintCoverageV1 | null | undefined,
  width: number, height: number,
  inversePoint: (x: number, y: number) => { x: number; y: number },
  destination: RasterPaintCoverageRectV1 = { x: 0, y: 0, width, height },
) => {
  const writer = createPaintCoverageWriter(null, width, height);
  if (!coverage) return null;
  if (![destination.x, destination.y, destination.width, destination.height].every(Number.isSafeInteger) || destination.x < 0 || destination.y < 0 ||
    destination.width < 0 || destination.height < 0 || destination.x + destination.width > width || destination.y + destination.height > height) invalid();
  for (let y = destination.y; y < destination.y + destination.height; y += 1) for (let x = destination.x; x < destination.x + destination.width; x += 1) {
    const source = inversePoint(x + 0.5, y + 0.5);
    if (!Number.isFinite(source.x) || !Number.isFinite(source.y)) invalid();
    const pixel = getPaintCoverage(coverage, Math.floor(source.x), Math.floor(source.y));
    if (pixel) writer.set(x, y, pixel);
  }
  return writer.finish();
};

/** Straight-alpha integer source-over, once over the captured run base. */
export const compositePaintPixelV1 = (pixel: RasterPaintPixelV1): [number, number, number, number] => {
  const remainingBaseAlpha = pixel.base[3] * (255 - pixel.coverage);
  const alphaNumerator = pixel.coverage * 255 + remainingBaseAlpha;
  return [
    ...pixel.pigment.map((channel, index) => Math.round((channel * pixel.coverage * 255 + pixel.base[index] * remainingBaseAlpha) / alphaNumerator)),
    Math.round(alphaNumerator / 255),
  ] as [number, number, number, number];
};

/** Nearest-neighbor selection compositing, including the transported paint run.
 * Only the supplied destination rectangle is read or changed. Preparation is
 * independent of the live canvas so allocation/validation failures are atomic.
 */
export const compositeRasterSelectionV1 = (
  destination: { width: number; height: number; data: Uint8ClampedArray },
  source: { width: number; height: number; data: Uint8ClampedArray },
  destinationCoverage: UnifiedRasterPaintCoverageV1 | null,
  sourceCoverage: UnifiedRasterPaintCoverageV1 | null,
  stageWidth: number, stageHeight: number, left: number, top: number,
  inversePoint: (x: number, y: number) => { x: number; y: number },
) => {
  assertDimensions(stageWidth, stageHeight);
  assertDimensions(source.width, source.height);
  assertDimensions(destination.width, destination.height);
  if (!integer(left, 0, stageWidth - 1) || !integer(top, 0, stageHeight - 1) ||
    left + destination.width > stageWidth || top + destination.height > stageHeight ||
    source.data.length !== source.width * source.height * 4 || destination.data.length !== destination.width * destination.height * 4 ||
    sourceCoverage && (sourceCoverage.width !== source.width || sourceCoverage.height !== source.height)) invalid();
  const data = new Uint8ClampedArray(destination.data);
  const writer = createPaintCoverageWriter(destinationCoverage, stageWidth, stageHeight);
  const over = (front: ArrayLike<number>, back: ArrayLike<number>): [number, number, number, number] => {
    const a = front[3] * 255 + back[3] * (255 - front[3]);
    if (!a) return [0, 0, 0, 0];
    return [0, 1, 2].map(i => Math.round((front[i] * front[3] * 255 + back[i] * back[3] * (255 - front[3])) / a))
      .concat(Math.round(a / 255)) as [number, number, number, number];
  };
  for (let y = 0; y < destination.height; y++) for (let x = 0; x < destination.width; x++) {
    const point = inversePoint(left + x + .5, top + y + .5);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) invalid();
    const sx = Math.floor(point.x), sy = Math.floor(point.y);
    if (sx < 0 || sy < 0 || sx >= source.width || sy >= source.height) continue;
    const src = (sy * source.width + sx) * 4, dst = (y * destination.width + x) * 4;
    if (!source.data[src + 3]) continue;
    const incoming = getPaintCoverage(sourceCoverage, sx, sy);
    const previous = writer.get(left + x, top + y);
    if (incoming) {
      const same = previous && keyText(previous.key) === keyText(incoming.key) && incoming.base[3] === 0;
      const pixel: RasterPaintPixelV1 = {
        key: incoming.key,
        base: same ? previous.base : over(incoming.base, data.subarray(dst, dst + 4)),
        coverage: Math.max(same ? previous.coverage : 0, incoming.coverage),
        pigment: incoming.pigment.map((v, i) => Math.max(v, same ? previous.pigment[i] : 0)) as [number, number, number],
        ...(incoming.owners ? { owners: mergeSketchOwners(same ? previous.owners : undefined, incoming.owners) } : {}),
      };
      data.set(compositePaintPixelV1(pixel), dst);
      writer.set(left + x, top + y, pixel);
    } else {
      data.set(over(source.data.subarray(src, src + 4), data.subarray(dst, dst + 4)), dst);
      writer.clear(left + x, top + y);
    }
  }
  return { data, paintCoverage: writer.finish() };
};
