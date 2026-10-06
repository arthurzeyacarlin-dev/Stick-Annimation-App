import type { UnifiedSymbolInstanceItemV2 } from "./unifiedAnimationContentV2";
import type { UnifiedBitmapSymbolDefinitionV2, UnifiedProjectCatalogsV2 } from "./unifiedAnimationContractV2";

// Small, pure helpers for code that makes Library symbols on its own (for example the
// AI animator: "Basketball", "Dark Lord's head"). They only build new catalog/instance
// values; the workspace applies them in one undoable step (see applyAnimatorScene).
// Nothing here changes the saved format: definitions and instances are the same
// `catalogs.symbols` / `symbol-instance/v1` records that hand-made symbols use.
// Everything is synchronous (no crypto.subtle), so the workspace can add symbols, frames
// and instances inside one undo step without waiting.

// The workspace keys a cell's symbol instances by layer and frame state (holds share it).
export const symbolCellKeyV2 = (layerId: string, stateId: number) => `${layerId}:${stateId}`;

const PNG_DATA_URL_PREFIX = "data:image/png;base64,";
const normalizeName = (name: string) => name.trim().normalize("NFC");
const nameKey = (name: string) => normalizeName(name).toLocaleLowerCase();

// SHA-256 (FIPS 180-4), synchronous. Gives the same digests as crypto.subtle (tested).
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export function sha256HexSync(bytes: Uint8Array): string {
  const bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const data = new Uint8Array(paddedLength);
  data.set(bytes);
  data[bytes.length] = 0x80;
  const view = new DataView(data.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(paddedLength - 4, bitLength >>> 0);
  const hash = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let i = 0; i < 64; i += 1) {
      const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + SHA256_K[i] + w[i]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    hash[0] = (hash[0] + a) >>> 0; hash[1] = (hash[1] + b) >>> 0; hash[2] = (hash[2] + c) >>> 0; hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0; hash[5] = (hash[5] + f) >>> 0; hash[6] = (hash[6] + g) >>> 0; hash[7] = (hash[7] + h) >>> 0;
  }
  return Array.from(hash, value => value.toString(16).padStart(8, "0")).join("");
}

const pngBytes = (pngDataUrl: string) => {
  const decoded = globalThis.atob(pngDataUrl.slice(PNG_DATA_URL_PREFIX.length));
  return Uint8Array.from(decoded, character => character.charCodeAt(0));
};

function assertPngDataUrl(pngDataUrl: unknown): asserts pngDataUrl is string {
  if (typeof pngDataUrl !== "string" || !pngDataUrl.startsWith(PNG_DATA_URL_PREFIX) || pngDataUrl.length <= PNG_DATA_URL_PREFIX.length) {
    throw new Error("symbol_png_required");
  }
}

export const pictureSha256V2 = (pngDataUrl: string) => {
  assertPngDataUrl(pngDataUrl);
  return `sha256:${sha256HexSync(pngBytes(pngDataUrl))}`;
};

// The same record (and the same two hashes) createBitmapSymbolDefinitionV2 makes for a Drawing Symbol.
export function createDrawingSymbolDefinitionSyncV2(input: {
  definitionId: string;
  name: string;
  width: number;
  height: number;
  pngDataUrl: string;
}): UnifiedBitmapSymbolDefinitionV2 {
  const assetSha256 = pictureSha256V2(input.pngDataUrl);
  const definitionDigest = `sha256:${sha256HexSync(new TextEncoder().encode(JSON.stringify({
    name: input.name,
    sourceCategory: "Drawing Symbol",
    width: input.width,
    height: input.height,
    assetSha256,
  })))}`;
  return {
    definitionId: input.definitionId,
    name: input.name,
    sourceCategory: "Drawing Symbol",
    width: input.width,
    height: input.height,
    pngDataUrl: input.pngDataUrl,
    assetSha256,
    definitionDigest,
  };
}

export type AddEngineSymbolInputV2 = {
  name: string;
  pngDataUrl: string;
  // Default size when the user drags it from the Library (canvas CSS pixels). Rounded to whole pixels.
  width: number;
  height: number;
  definitionId?: string;
};

export type AddEngineSymbolResultV2 = {
  catalogs: UnifiedProjectCatalogsV2;
  definition: UnifiedBitmapSymbolDefinitionV2;
  // "created": a new Library entry. "reused": a symbol with this exact name AND picture was already there.
  status: "created" | "reused";
};

// Adds a symbol the engine made (Arthur's rules):
// - reuse a Library symbol only when its name AND picture both match;
// - if the name is taken by a different picture, use the next free "Name 2", "Name 3", ...;
// - never change or remove any existing symbol (the user's own ones included).
// Two differently named symbols may share one picture (two figures with the same look and real names).
export function addEngineLibrarySymbolV2(catalogs: UnifiedProjectCatalogsV2, input: AddEngineSymbolInputV2): AddEngineSymbolResultV2 {
  const baseName = normalizeName(input.name);
  if (!baseName) throw new Error("symbol_name_required");
  const assetSha256 = pictureSha256V2(input.pngDataUrl);
  if (!Number.isFinite(input.width) || !Number.isFinite(input.height) || input.width <= 0 || input.height <= 0) throw new Error("symbol_size_invalid");
  const width = Math.max(1, Math.round(input.width));
  const height = Math.max(1, Math.round(input.height));
  for (let suffix = 1; suffix < 10_000; suffix += 1) {
    const name = suffix === 1 ? baseName : `${baseName} ${suffix}`;
    const existing = catalogs.symbols.find(symbol => nameKey(symbol.name) === nameKey(name));
    if (existing) {
      if (existing.assetSha256 === assetSha256 && existing.sourceCategory === "Drawing Symbol" && !existing.structuredPayload) {
        return { catalogs, definition: existing, status: "reused" };
      }
      continue;
    }
    const definition = createDrawingSymbolDefinitionSyncV2({
      definitionId: input.definitionId ?? globalThis.crypto.randomUUID(),
      name, width, height, pngDataUrl: input.pngDataUrl,
    });
    if (catalogs.symbols.some(symbol => symbol.definitionDigest === definition.definitionDigest || symbol.definitionId === definition.definitionId)) {
      throw new Error("symbol_definition_duplicate");
    }
    return { catalogs: { ...catalogs, symbols: [...catalogs.symbols, definition] }, definition, status: "created" };
  }
  throw new Error("symbol_name_unavailable");
}

export type SymbolPlacementV2 = {
  // Center of the object on the 1920x1080 stage.
  centerX: number;
  centerY: number;
  // Size on the stage. Give one or both; a missing one follows the symbol's picture shape.
  width?: number;
  height?: number;
  rotation?: number; // degrees, clockwise
  flipX?: boolean;
  flipY?: boolean;
  itemId?: string;
  // The drawing canvas size it is placed against (see UnifiedSymbolInstanceItemV2.drawingCanvas).
  drawingCanvas?: { width: number; height: number };
};

// One placed copy of a Library symbol (stage units, same record the canvas makes when you drop one).
export function createSymbolInstanceV2(
  definition: Pick<UnifiedBitmapSymbolDefinitionV2, "definitionId" | "definitionDigest" | "width" | "height">,
  placement: SymbolPlacementV2,
): UnifiedSymbolInstanceItemV2 {
  const aspect = definition.width / definition.height;
  const width = placement.width ?? (placement.height !== undefined ? placement.height * aspect : definition.width);
  const height = placement.height ?? (placement.width !== undefined ? placement.width / aspect : definition.height);
  const rotation = placement.rotation ?? 0;
  if (!Number.isFinite(placement.centerX) || !Number.isFinite(placement.centerY) || !Number.isFinite(rotation) ||
    !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error("symbol_placement_invalid");
  // The saved-project check refuses -0, so it is written as 0.
  const plain = (value: number) => (Object.is(value, -0) ? 0 : value);
  return {
    itemId: placement.itemId ?? globalThis.crypto.randomUUID(),
    kind: "symbol-instance/v1",
    definitionId: definition.definitionId,
    definitionDigest: definition.definitionDigest,
    x: plain(placement.centerX - width / 2),
    y: plain(placement.centerY - height / 2),
    width,
    height,
    rotation: plain(rotation),
    flipX: Boolean(placement.flipX),
    flipY: Boolean(placement.flipY),
    ...(placement.drawingCanvas ? { drawingCanvas: validDrawingCanvas(placement.drawingCanvas) } : {}),
  };
}

const validDrawingCanvas = (size: { width: number; height: number }) => {
  if (!Number.isInteger(size.width) || !Number.isInteger(size.height) || size.width < 1 || size.height < 1 || size.width > 1_000_000 || size.height > 1_000_000) {
    throw new Error("symbol_placement_invalid");
  }
  return { width: size.width, height: size.height };
};

// Adds instances to cells (keeps what is already there) and returns a new record.
// Every instance must point at a symbol in `catalogs` with the same digest, so the
// project still saves and exports.
export function addSymbolInstancesToCellsV2(
  instancesByCell: Readonly<Record<string, readonly UnifiedSymbolInstanceItemV2[]>>,
  additions: ReadonlyArray<{ cellKey: string; instances: readonly UnifiedSymbolInstanceItemV2[] }>,
  catalogs: UnifiedProjectCatalogsV2,
): Record<string, UnifiedSymbolInstanceItemV2[]> {
  const digests = new Map(catalogs.symbols.map(symbol => [symbol.definitionId, symbol.definitionDigest]));
  const itemIds = new Set(Object.values(instancesByCell).flat().map(instance => instance.itemId));
  const next: Record<string, UnifiedSymbolInstanceItemV2[]> = {};
  for (const [key, instances] of Object.entries(instancesByCell)) next[key] = [...instances];
  for (const { cellKey, instances } of additions) {
    if (!cellKey) throw new Error("symbol_cell_required");
    for (const instance of instances) {
      if (digests.get(instance.definitionId) !== instance.definitionDigest) throw new Error("symbol_definition_missing");
      if (itemIds.has(instance.itemId)) throw new Error("symbol_instance_duplicate");
      itemIds.add(instance.itemId);
    }
    next[cellKey] = [...(next[cellKey] ?? []), ...instances.map(instance => structuredClone(instance))];
  }
  return next;
}

type SymbolPictureCanvas = {
  width: number;
  height: number;
  getContext(kind: "2d"): CanvasRenderingContext2D | null;
  toDataURL(type: "image/png"): string;
};

// Draws a symbol picture with a drawing function (stage units are up to the caller) and
// returns the PNG data URL that addLibrarySymbolV2 needs. Browser only unless a canvas is given.
export function renderSymbolPngDataUrlV2(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
  createCanvas: () => SymbolPictureCanvas = () => document.createElement("canvas"),
) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 4096 || height > 4096) throw new Error("symbol_size_invalid");
  const canvas = createCanvas();
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("symbol_canvas_unavailable");
  draw(ctx);
  const dataUrl = canvas.toDataURL("image/png");
  if (!dataUrl.startsWith(PNG_DATA_URL_PREFIX)) throw new Error("symbol_png_required");
  return dataUrl;
}
