import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  assertRasterPaintCoverageV1, attachBitmapPaintCoverage, compositePaintPixelV1, compositeRasterSelectionV1, copyBitmapPaintCoverage,
  createPaintCoverageWriter, cropPaintCoverage, forEachPaintCoverage, getBitmapPaintCoverage,
  getPaintCoverage, mergeSketchOwners, paintCoveragesEqual, patchPaintCoverage, remapSketchOwners, resolveSketchKnifeOwner, transformPaintCoverage, translatePaintCoverage,
  type RasterPaintPixelV1, type UnifiedRasterPaintCoverageV1,
} from "../../../src/lib/animation/unifiedRasterPaintCoverageV1.ts";
import { assertUnifiedAnimationProjectV2, type UnifiedAnimationProjectV2 } from "../../../src/lib/animation/unifiedAnimationContractV2.ts";
import { createUnifiedProjectStorageV2 } from "../../../src/lib/animation/unifiedProjectStorageV2.ts";
import { createUnifiedProjectRepositoryV2 } from "../../../src/lib/animation/unifiedProjectRepositoryV2.ts";
import { createPhase6Project, Phase6MemoryStorageAdapter } from "../../spec0006-unified/phase6FixtureFactory.ts";
import { currentSourceDigest, writeUnitResult } from "./proofContract.ts";

const sourceDigestBefore = currentSourceDigest();
let assertions = 0;
const equal = (left: unknown, right: unknown, label: string) => { assert.deepEqual(left, right, label); assertions += 1; };
const check = (value: unknown, label: string) => { assert.ok(value, label); assertions += 1; };
const throws = (operation: () => unknown, label: string) => { assert.throws(operation, { message: "invalid_record" }, label); assertions += 1; };
const reject = async (operation: () => Promise<unknown>, code: string) => { await assert.rejects(operation, { message: code }); assertions += 1; };
const sha = (bytes: Uint8Array | Uint8ClampedArray | string) => createHash("sha256").update(bytes).digest("hex");
const digestCoverage = (value: UnifiedRasterPaintCoverageV1 | null | undefined) => sha(JSON.stringify(value, (_key, entry) => entry instanceof Uint8Array ? [...entry] : entry));
const black: RasterPaintPixelV1 = { key: { variant: "Brush", color: "#000000", opacityByte: 26 }, base: [0, 0, 0, 0], coverage: 26, pigment: [0, 0, 0] };
const cyan: RasterPaintPixelV1 = { key: { variant: "Glow", color: "#00ffff", opacityByte: 26 }, base: [0, 0, 0, 0], coverage: 26, pigment: [128, 255, 255] };

const writer = createPaintCoverageWriter(null, 65, 33);
for (let x = 0; x < 32; x += 1) writer.set(x, 0, black);
writer.set(64, 32, cyan);
const initial = writer.finish()!;
assertRasterPaintCoverageV1(initial); assertions += 1;
writer.set(0, 0, black);
check(writer.finish() === initial, "identical repeated paint reuses sealed immutable tiles");
equal([...initial.tiles[0].runs], [0, 0, 32, 0, 0, 0, 0, 0, 0, 0, 26, 0, 0, 0], "independent fixed RLE byte layout");
equal(initial.tiles.map(tile => [tile.x, tile.y]), [[0, 0], [64, 32]], "canonical tile order");
equal(initial.tiles[1].palette, [cyan.key], "local tile palette");
equal(getPaintCoverage(initial, 31, 0), black, "last pixel in first RLE run");
equal(getPaintCoverage(initial, 32, 0), null, "absent run means flattened base");
equal(getPaintCoverage(initial, 64, 32), cyan, "edge tile pixel");
equal(getPaintCoverage(initial, 65, 32), null, "query outside stage has no run");
equal(compositePaintPixelV1(black), [0, 0, 0, 26], "exact ten-percent alpha");
equal(compositePaintPixelV1({ ...black, base: [0, 0, 255, 26], pigment: [255, 0, 0] }), [134, 0, 121, 49], "different-paint run collapses once");

const initialDigest = digestCoverage(initial);
const ownedWriter = createPaintCoverageWriter(null, 3, 1), callerPixel = structuredClone(black);
ownedWriter.set(0, 0, callerPixel);
check(!Object.isFrozen(callerPixel.key), "writer never freezes the caller key");
callerPixel.key.color = "#00ffff"; callerPixel.base[0] = 91; callerPixel.pigment[0] = 37;
equal(ownedWriter.get(0, 0), black, "caller mutation cannot alter an owned paint record");
const borrowedPixel = ownedWriter.get(0, 0)!; borrowedPixel.key.color = "#ffffff"; borrowedPixel.base[1] = 53;
equal(ownedWriter.get(0, 0), black, "returned key and base mutation remain isolated");
ownedWriter.set(1, 0, callerPixel); const middlePixel = structuredClone(callerPixel);
callerPixel.key.color = black.key.color; callerPixel.base = [...black.base]; callerPixel.pigment = [...black.pigment];
ownedWriter.set(2, 0, callerPixel);
const ownedResult = ownedWriter.finish()!;
equal(getPaintCoverage(ownedResult, 0, 0), black, "A-B-A key changes retain first pixel");
equal(getPaintCoverage(ownedResult, 1, 0), middlePixel, "A-B-A key changes retain middle pixel");
equal(getPaintCoverage(ownedResult, 2, 0), black, "A-B-A key changes retain final pixel");
check(ownedResult.tiles[0].palette.every(key => key !== callerPixel.key && !Object.isFrozen(key)), "serialized palettes are fresh independently owned records");
for (const field of ["base", "pigment"] as const) {
  const length = black[field].length;
  for (let missing = 0; missing < length + 2; missing++) {
    const candidate = structuredClone(black);
    if (missing < length) delete candidate[field][missing];
    else if (missing === length) Reflect.set(candidate, field, new Array(length));
    else (candidate[field] as unknown[])[0] = undefined;
    const candidateWriter = createPaintCoverageWriter(initial, 65, 33);
    throws(() => candidateWriter.set(0, 0, candidate), `${field} missing byte ${missing} rejects`);
    equal(candidateWriter.get(0, 0), black, "invalid tuple does not mutate the current pixel");
    check(candidateWriter.finish() === initial, "invalid tuple leaves sealed coverage unchanged");
  }
}
const editedWriter = createPaintCoverageWriter(initial, 65, 33);
editedWriter.set(1, 0, cyan);
editedWriter.clear(2, 0);
const edited = editedWriter.finish()!;
assertRasterPaintCoverageV1(edited); assertions += 1;
equal(digestCoverage(initial), initialDigest, "copy-on-write preserves immutable source bytes");
check(edited.tiles[1] === initial.tiles[1], "untouched tile retains reference");
check(edited.tiles[0] !== initial.tiles[0], "touched tile receives new bytes");
equal(getPaintCoverage(edited, 1, 0), cyan, "new key only at targeted pixel");
equal(getPaintCoverage(edited, 2, 0), null, "clear only at exact target");
equal(getPaintCoverage(edited, 3, 0), black, "neighbor run survives clear");
check(!paintCoveragesEqual(initial, edited), "companion changes are authored changes");
check(paintCoveragesEqual(initial, structuredClone(initial)), "byte-equivalent cloned companion");

const associated = attachBitmapPaintCoverage({}, initial);
equal(getBitmapPaintCoverage(copyBitmapPaintCoverage(associated, {})), initial, "runtime clone copies companion association");
attachBitmapPaintCoverage(associated, null);
equal(getBitmapPaintCoverage(associated), null, "explicit association clear");
equal(getBitmapPaintCoverage({ paintCoverage: initial }), initial, "serialized bitmap companion is discoverable");

const crop = cropPaintCoverage(initial, 16, 0, 16, 2)!;
equal(crop.tiles[0].runs.length, 14, "cropped contiguous records stay RLE compressed");
equal(getPaintCoverage(crop, 15, 0), black, "crop rebases metadata exactly");
const translated = translatePaintCoverage(crop, 80, 40, 40, 10)!;
equal(getPaintCoverage(translated, 55, 10), black, "translation moves metadata with pixels");
equal(getPaintCoverage(translated, 15, 0), null, "translation does not leave old runs");
throws(() => translatePaintCoverage(initial, 65, 33, 1, 0), "translation cannot silently clip active provenance");
const patched = patchPaintCoverage(initial, crop, 8, 4, 16, 2, 65, 33)!;
equal(getPaintCoverage(patched, 8, 4), black, "patch adds rebased runs");
equal(getPaintCoverage(patched, 64, 32), cyan, "patch preserves outside target");
const cleared = patchPaintCoverage(initial, null, 0, 0, 32, 1, 65, 33)!;
equal(getPaintCoverage(cleared, 0, 0), null, "null patch clears only target companion");
equal(getPaintCoverage(cleared, 64, 32), cyan, "null patch retains untargeted companion");
equal(getPaintCoverage(patchPaintCoverage(null, crop, 4, 5, 16, 2, 65, 33), 4, 5), black, "patch onto legacy null base");
// Compare aligned tile copies against an independent per-pixel reference,
// including the one-pixel right/bottom edges and negative crop origins.
const fastWriter = createPaintCoverageWriter(initial, 65, 33);
[[31, 31], [32, 0], [63, 31], [32, 32], [64, 0], [0, 32]].forEach(([x, y], i) => fastWriter.set(x, y, i % 2 ? cyan : black));
const fastFixture = fastWriter.finish()!, fastDigest = digestCoverage(fastFixture);
const copyIsolated = (copy: UnifiedRasterPaintCoverageV1["tiles"][number], source: UnifiedRasterPaintCoverageV1["tiles"][number]) => {
  check(copy !== source && copy.runs.buffer !== source.runs.buffer && copy.palette !== source.palette && copy.palette.every((key, i) => key !== source.palette[i]), "copied tile owns its bytes and palette");
};
for (const [left, top, width, height] of [[0, 0, 65, 33], [32, 0, 33, 33], [64, 32, 1, 1], [-32, -32, 97, 65], [-32, -32, 64, 64], [96, 64, 32, 32]]) {
  const reference = createPaintCoverageWriter(null, width, height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const pixel = getPaintCoverage(fastFixture, x + left, y + top); if (pixel) reference.set(x, y, pixel);
  }
  const actual = cropPaintCoverage(fastFixture, left, top, width, height);
  equal(actual, reference.finish(), `aligned crop pixel parity ${left},${top},${width},${height}`);
  for (const tile of actual?.tiles ?? []) copyIsolated(tile, fastFixture.tiles.find(source => source.x === tile.x + left && source.y === tile.y + top)!);
}
equal(cropPaintCoverage(null, -32, -32, 97, 65), null, "aligned empty crop stays absent");
for (const [left, top, width, height] of [[0, 0, 32, 32], [32, 0, 33, 33], [64, 32, 1, 1], [0, 0, 65, 33]]) {
  const sparse = createPaintCoverageWriter(null, width, height); sparse.set(0, 0, cyan); sparse.set(width - 1, height - 1, black);
  const incoming = sparse.finish()!;
  for (const base of [fastFixture, null]) for (const patch of [incoming, null]) {
    const beforeBase = digestCoverage(base), beforePatch = digestCoverage(patch), reference = createPaintCoverageWriter(null, 65, 33);
    for (let y = 0; y < 33; y++) for (let x = 0; x < 65; x++) {
      const inside = x >= left && y >= top && x < left + width && y < top + height;
      const pixel = inside ? getPaintCoverage(patch, x - left, y - top) : getPaintCoverage(base, x, y);
      if (pixel) reference.set(x, y, pixel);
    }
    const actual = patchPaintCoverage(base, patch, left, top, width, height, 65, 33);
    equal(actual, reference.finish(), `aligned patch pixel parity ${left},${top},${width},${height}`);
    for (const tile of patch?.tiles ?? []) copyIsolated(actual!.tiles.find(target => target.x === tile.x + left && target.y === tile.y + top)!, tile);
    if (actual) {
      const beforeActual = digestCoverage(actual), edit = createPaintCoverageWriter(actual, 65, 33);
      let clearedFirst = false;
      forEachPaintCoverage(actual, (_pixel, x, y) => { if (!clearedFirst) { edit.clear(x, y); clearedFirst = true; } }); edit.finish();
      equal(digestCoverage(actual), beforeActual, "subsequent edit preserves sealed patch result");
    }
    equal(digestCoverage(base), beforeBase, "aligned patch preserves base bytes"); equal(digestCoverage(patch), beforePatch, "aligned patch preserves incoming bytes");
  }
}
equal(digestCoverage(fastFixture), fastDigest, "all aligned operations preserve original fixture");
const flipped = transformPaintCoverage(crop, 16, 2, (x, y) => ({ x: 16 - x, y }))!;
equal(getPaintCoverage(flipped, 0, 0), black, "nearest-neighbor affine provenance transform");
throws(() => transformPaintCoverage(crop, 16, 2, () => ({ x: NaN, y: 0 })), "nonfinite transform rejected");

const selectionPixels = { width: 16, height: 2, data: new Uint8ClampedArray(16 * 2 * 4) };
for (let x = 0; x < 16; x++) selectionPixels.data.set([0, 0, 0, 26], x * 4);
const destinationPixels = { width: 16, height: 2, data: new Uint8ClampedArray(selectionPixels.data) };
const duplicate = compositeRasterSelectionV1(destinationPixels, selectionPixels, crop, crop, 16, 2, 0, 0, (x, y) => ({ x, y }));
equal(duplicate.data, selectionPixels.data, "duplicate same paint does not darken pixels");
check(paintCoveragesEqual(duplicate.paintCoverage, crop), "duplicate same paint retains exact companion");
for (const offset of [0, 1, 5]) {
  const blank = { width: 40, height: 8, data: new Uint8ClampedArray(40 * 8 * 4) };
  const moved = compositeRasterSelectionV1(blank, selectionPixels, null, crop, 40, 8, 0, 0, (x, y) => ({ x: x - offset, y: y - 3 }));
  for (let x = 0; x < 16; x++) {
    equal(moved.data[((3 * 40) + x + offset) * 4 + 3], 26, "selection alpha translates exactly");
    equal(getPaintCoverage(moved.paintCoverage, x + offset, 3), black, "selection metadata translates exactly");
  }
  equal(blank.data, new Uint8ClampedArray(blank.data.length), "selection prepares without mutating destination");
}
throws(() => compositeRasterSelectionV1(destinationPixels, selectionPixels, crop, crop, 16, 2, 0, 0, () => ({ x: NaN, y: 0 })), "invalid transform leaves prepared source intact");

const mutations: [string, (coverage: UnifiedRasterPaintCoverageV1) => void][] = [
  ["version", value => { Object.assign(value, { version: 3 }); }],
  ["unknown-field", value => { Object.assign(value, { bypass: true }); }],
  ["dimensions", value => { value.width = 0; }],
  ["allocation", value => { value.width = 268_435_456; }],
  ["tile-size", value => { Object.assign(value, { tileSize: 64 }); }],
  ["tile-order", value => { value.tiles.reverse(); }],
  ["tile-coordinate", value => { value.tiles[0].x = 1; }],
  ["negative-zero", value => { value.tiles[0].x = -0; }],
  ["duplicate-tile", value => { value.tiles.push(structuredClone(value.tiles[1])); }],
  ["unknown-tile-field", value => { Object.assign(value.tiles[0], { hidden: true }); }],
  ["palette-variant", value => { Object.assign(value.tiles[0].palette[0], { variant: "Fill" }); }],
  ["palette-color", value => { value.tiles[0].palette[0].color = "#FFFFFF"; }],
  ["palette-opacity", value => { value.tiles[0].palette[0].opacityByte = 0; }],
  ["palette-extra", value => { Object.assign(value.tiles[0].palette[0], { smoothing: 100 }); }],
  ["palette-unreferenced", value => { value.tiles[0].palette.push(cyan.key); }],
  ["wrong-bytes", value => { Object.assign(value.tiles[0], { runs: [...value.tiles[0].runs] }); }],
  ["truncated-run", value => { value.tiles[0].runs = value.tiles[0].runs.slice(1); }],
  ["empty-run", value => { value.tiles[0].runs[2] = 0; }],
  ["run-too-long", value => { value.tiles[0].runs[3] = 5; }],
  ["palette-ref", value => { value.tiles[0].runs[4] = 1; }],
  ["coverage-over-ceiling", value => { value.tiles[0].runs[10] = 27; }],
  ["zero-coverage", value => { value.tiles[0].runs[10] = 0; }],
  ["edge-overflow", value => { value.tiles[1].runs[2] = 2; }],
  ["overlapping-runs", value => { value.tiles[0].runs = new Uint8Array([...value.tiles[0].runs, ...value.tiles[0].runs]); }],
  ["unmerged-adjacent-runs", value => {
    const first = value.tiles[0].runs.slice(), second = value.tiles[0].runs.slice();
    first[2] = 16; second[0] = 16; second[2] = 16;
    value.tiles[0].runs = new Uint8Array([...first, ...second]);
  }],
];
for (const [label, mutate] of mutations) {
  const candidate = structuredClone(initial);
  mutate(candidate);
  throws(() => assertRasterPaintCoverageV1(candidate), label);
}
throws(() => assertRasterPaintCoverageV1(null as never), "present null is corruption, never legacy absence");
throws(() => assertRasterPaintCoverageV1(Object.assign([], initial) as never), "array-shaped companion is rejected");
throws(() => createPaintCoverageWriter(initial, 64, 33), "writer cannot change stage dimensions implicitly");
throws(() => createPaintCoverageWriter(null, 65, 33).set(65, 0, black), "writer cannot silently lose outside pixels");

const buildProject = async (coverage: UnifiedRasterPaintCoverageV1) => {
  const project = await createPhase6Project();
  project.title = "SPEC-0007 Coverage Persistence";
  const raster = project.document.layers[0].cells[0].content!.items.find(item => item.kind === "drawing-raster/v1")!;
  assert.equal(raster.kind, "drawing-raster/v1");
  const data = new Uint8ClampedArray(coverage.width * coverage.height * 4);
  forEachPaintCoverage(coverage, (pixel, x, y) => data.set(compositePaintPixelV1(pixel), (y * coverage.width + x) * 4));
  raster.bitmap = { width: coverage.width, height: coverage.height, data, paintCoverage: coverage };
  return project;
};
const getRaster = (project: UnifiedAnimationProjectV2) => {
  const raster = project.document.layers[0].cells[0].content!.items.find(item => item.kind === "drawing-raster/v1")!;
  assert.equal(raster.kind, "drawing-raster/v1");
  return raster.bitmap!;
};
const payload = (project: UnifiedAnimationProjectV2) => ({ pixels: sha(getRaster(project).data), coverage: digestCoverage(getRaster(project).paintCoverage) });
const project = await buildProject(initial);
assertUnifiedAnimationProjectV2(project); assertions += 1;
const croppedProject = structuredClone(project);
const croppedRaster = getRaster(croppedProject);
const croppedCoverage = cropPaintCoverage(initial, 0, 0, 32, 1)!;
croppedRaster.data = croppedRaster.data.slice(0, 32 * 4);
croppedRaster.width = 32; croppedRaster.height = 1;
croppedRaster.x = 0; croppedRaster.y = 0; croppedRaster.stageWidth = 65; croppedRaster.stageHeight = 33;
croppedRaster.paintCoverage = translatePaintCoverage(croppedCoverage, 65, 33, 0, 0)!;
assertUnifiedAnimationProjectV2(croppedProject); assertions += 1;
equal(croppedRaster.paintCoverage.width, 65, "canonical visible crop keeps full-stage companion coordinates");
const legacy = structuredClone(project); delete getRaster(legacy).paintCoverage;
assertUnifiedAnimationProjectV2(legacy); assertions += 1;
equal(sha(getRaster(project).data), sha(getRaster(legacy).data), "legacy companion absence preserves flattened raster bytes");
const invalidRaster = structuredClone(project); getRaster(invalidRaster).data[3] = 0;
throws(() => assertUnifiedAnimationProjectV2(invalidRaster), "companion cannot reference missing authored pixels");
const invalidNull = structuredClone(project); Object.assign(getRaster(invalidNull), { paintCoverage: null });
throws(() => assertUnifiedAnimationProjectV2(invalidNull), "V2 present null companion rejected");

const adapter = new Phase6MemoryStorageAdapter();
const storage = createUnifiedProjectStorageV2(adapter);
const repository = createUnifiedProjectRepositoryV2({ now: () => "2026-09-15T00:00:00.000Z", createId: () => "92fa8382-e064-422b-8830-7656911c98bc", storage });
const saved = await repository.save(project);
equal(payload(saved), payload(project), "real V2 encode/readback keeps exact raster and companion");
equal(payload(await repository.open(saved.projectId)), payload(project), "real V2 Open keeps companion");
const copy = await repository.saveAs(saved, "Coverage copy");
equal(payload(copy), payload(saved), "real Save As preserves exact companion");
check(copy.projectId !== saved.projectId, "Save As retains distinct identity");
const later = await buildProject(edited); later.revision = saved.revision;
const savedLater = await repository.save(later);
equal(payload(savedLater), payload(later), "later Save preserves changed coverage");
const firstAssets = new Set([...adapter.versions.values()].find(version => version.projectId === saved.projectId && version.revision === 1)!.assetIds);
const laterVersion = [...adapter.versions.values()].find(version => version.projectId === saved.projectId && version.revision === 2)!;
const changedRuns = laterVersion.assetIds.filter(id => !firstAssets.has(id)).find(id => {
  const asset = adapter.assets.get(id)!;
  return asset.byteLength === edited.tiles[0].runs.byteLength && sha(asset.bytes) === sha(edited.tiles[0].runs);
});
check(changedRuns, "coverage run bytes are independently content-addressed assets");
const preservedAsset = adapter.assets.get(changedRuns!)!;
adapter.assets.delete(changedRuns!);
equal(payload(await storage.read(saved.projectId)), payload(saved), "missing active companion asset recovers exact previous raster and companion together");
adapter.assets.set(changedRuns!, { ...preservedAsset, bytes: preservedAsset.bytes.map((value, index) => index === 0 ? value ^ 1 : value) });
equal(payload(await storage.read(saved.projectId)), payload(saved), "corrupt active companion digest recovers exact previous version");
adapter.assets.set(changedRuns!, preservedAsset);
equal(payload(await storage.read(saved.projectId)), payload(savedLater), "restored active assets reopen full current version");

const faultNames = ["encode", "hash", "decode", "readback", "beforePublish", "quota", "asset", "version", "abort", "cas"] as const;
for (const fault of faultNames) {
  const faultAdapter = new Phase6MemoryStorageAdapter();
  const faultStorage = createUnifiedProjectStorageV2(faultAdapter);
  const first = await faultStorage.write({ ...project, revision: 1 }, null);
  const next = { ...later, revision: 2 };
  const beforeHead = structuredClone(faultAdapter.heads.get(first.projectId));
  const hooks = ["encode", "hash", "decode", "readback", "beforePublish"].includes(fault)
    ? { [fault]: () => { throw new Error(`${fault}_failed`); } } : {};
  if (["quota", "asset", "version", "abort", "cas"].includes(fault)) faultAdapter.fault = fault as typeof faultAdapter.fault;
  const code = fault === "quota" ? "collection_too_large" : fault === "asset" ? "asset_missing" : fault === "version" ? "readback_failed" :
    fault === "abort" ? "storage_write_failed" : fault === "cas" ? "stale_revision" : `${fault}_failed`;
  await reject(() => faultStorage.write(next, 1, hooks), code);
  equal(faultAdapter.heads.get(first.projectId), beforeHead, `${fault} keeps head`);
  equal(payload(await faultStorage.read(first.projectId)), payload(first), `${fault} keeps exact last-good pixels and companion`);
  faultAdapter.fault = null;
  equal(payload(await faultStorage.write(next, 1)), payload(next), `${fault} recovery retry succeeds`);
}

const dense = createPaintCoverageWriter(null, 256, 256);
for (let y = 0; y < 256; y += 1) for (let x = 0; x < 256; x += 1) dense.set(x, y, black);
const compressed = dense.finish()!;
assertRasterPaintCoverageV1(compressed); assertions += 1;
equal(compressed.tiles.reduce((total, tile) => total + tile.runs.byteLength, 0), 64 * 14, "solid coverage retains one RLE record per tile");
equal(compressed.tiles.length, 64, "256-square exact tile count");
const reverse = createPaintCoverageWriter(null, 65, 33);
reverse.set(64, 32, cyan);
for (let x = 31; x >= 0; x -= 1) reverse.set(x, 0, black);
equal(digestCoverage(reverse.finish()), initialDigest, "insertion order does not change serialized provenance");

const ownershipCases = [];
for (const opacityByte of [26, 128, 255]) {
  const ownedPixel: RasterPaintPixelV1 = { key: { variant: "Sketch", color: "#ff0000", opacityByte }, base: [0, 0, 0, 0], coverage: opacityByte, pigment: [255, 0, 0], owners: ["stroke-a"] };
  const ownedWriter = createPaintCoverageWriter(null, 32, 32);
  for (const [x, y] of [[10, 5], [10, 6], [10, 7], [7, 4], [13, 9]]) ownedWriter.set(x, y, ownedPixel);
  ownedWriter.set(8, 4, { ...ownedPixel, owners: ["stroke-b"] });
  ownedWriter.set(10, 6, { ...ownedPixel, owners: mergeSketchOwners(ownedPixel.owners, ["stroke-b"]) });
  const owned = ownedWriter.finish()!;
  equal(owned.version, 2, "Sketch contributors use the additive versioned companion");
  assertRasterPaintCoverageV1(owned); assertions++;
  equal(resolveSketchKnifeOwner(owned, [6 * 32 + 10, 7 * 32 + 10]), "stroke-a", "exact intersected owner, independent of nearby same-color stroke");
  const target: number[] = [], unrelated: number[] = [];
  forEachPaintCoverage(owned, (pixel, x, y) => (pixel.owners?.includes("stroke-a") ? target : unrelated).push(y * 32 + x));
  equal(target.sort((a, b) => a - b), [4 * 32 + 7, 5 * 32 + 10, 6 * 32 + 10, 7 * 32 + 10, 9 * 32 + 13], "detached dabs belong to exact target without proximity pickup");
  equal(unrelated, [4 * 32 + 8], "adjacent unrelated authored dab remains separate");
  const transported = translatePaintCoverage(owned, 64, 64, 8, 8)!;
  equal(getPaintCoverage(transported, 15, 12)?.owners, ["stroke-a"], "detached ownership translates");
  equal(cropPaintCoverage(transported, 8, 8, 32, 32), owned, "ownership survives exact crop round trip");
  const remapped = remapSketchOwners(owned, id => `copy-${id}`)!;
  equal(getPaintCoverage(remapped, 10, 6)?.owners, ["copy-stroke-a", "copy-stroke-b"], "duplicate gets fresh contributor identities");
  equal(getPaintCoverage(owned, 10, 6)?.owners, ["stroke-a", "stroke-b"], "duplicate leaves source metadata immutable");
  const eraseOwned = createPaintCoverageWriter(owned, 32, 32); eraseOwned.clear(7, 4);
  equal(getPaintCoverage(eraseOwned.finish(), 7, 4), null, "erasure clears detached provenance with pixels");
  const clone = structuredClone(owned); clone.tiles[0].palette.find(entry => entry.owners)!.owners![0] = "changed";
  check(!paintCoveragesEqual(owned, clone), "ownership affects provenance equality");
  const legacyClaim = structuredClone(owned); legacyClaim.version = 1;
  throws(() => assertRasterPaintCoverageV1(legacyClaim), "legacy format cannot smuggle ownership");
  for (const owners of [[], ["stroke-a", "stroke-a"], ["stroke-b", "stroke-a"], ["bad id"], ["x".repeat(65)]]) {
    throws(() => createPaintCoverageWriter(null, 32, 32).set(0, 0, { ...ownedPixel, owners }), "malformed owner list fails closed");
  }
  throws(() => createPaintCoverageWriter(null, 32, 32).set(0, 0, { ...black, owners: ["stroke-a"] }), "ownership is not a new paint-key field on other variants");
  const ownedProject = await buildProject(owned), ownedAdapter = new Phase6MemoryStorageAdapter(), ownedStorage = createUnifiedProjectStorageV2(ownedAdapter);
  const stored = await ownedStorage.write({ ...ownedProject, revision: 1 }, null);
  const reopened = await ownedStorage.read(stored.projectId);
  equal(payload(reopened), payload(stored), "versioned ownership survives real storage encode/decode");
  equal(getPaintCoverage(getRaster(reopened).paintCoverage, 7, 4)?.owners, ["stroke-a"], "reopened detached dab retains originating gesture");
  ownershipCases.push({ opacityByte, targetPixels: target.length, unrelatedPixels: unrelated.length, version: owned.version, persisted: payload(reopened), duplicateDigest: digestCoverage(remapped) });
}

const report = { status: "PASS", assertions, negativeMutations: mutations.map(([label]) => label), storageFaults: faultNames,
  initialCoverageDigest: initialDigest, persisted: payload(saved), storedBytes: adapter.heads.get(saved.projectId)!.storedByteLength,
  compressedSolidRunBytes: compressed.tiles.reduce((total, tile) => total + tile.runs.byteLength, 0), ownershipCases, externalRequests: 0 };
writeUnitResult("coverage-persistence", sourceDigestBefore, report, assertions);
console.log(JSON.stringify(report));
