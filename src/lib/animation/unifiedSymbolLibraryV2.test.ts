import assert from "node:assert/strict";
import { test } from "node:test";
import type { UnifiedAnimationDocumentV2, UnifiedProjectCatalogsV2 } from "./unifiedAnimationContractV2";

const {
  addEngineLibrarySymbolV2,
  addSymbolInstancesToCellsV2,
  createDrawingSymbolDefinitionSyncV2,
  createSymbolInstanceV2,
  renderSymbolPngDataUrlV2,
  sha256HexSync,
  symbolCellKeyV2,
} = await import("./unifiedSymbolLibraryV2.ts");
const { assertUnifiedAnimationDocumentV2 } = await import("./unifiedAnimationContractV2.ts");
const { appendSymbolDefinitionV2, assertStructuredSymbolDigestsV2, createBitmapSymbolDefinitionV2 } = await import("./unifiedProjectCatalogV2.ts");

const png = (seed: string) => `data:image/png;base64,${Buffer.from(`fake-png-${seed}`).toString("base64")}`;
const empty = (): UnifiedProjectCatalogsV2 => ({ symbols: [], assets: [] });
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const add = (catalogs: UnifiedProjectCatalogsV2, name: string, picture: string, n?: number) =>
  addEngineLibrarySymbolV2(catalogs, { name, pngDataUrl: png(picture), width: 100, height: 100, definitionId: n === undefined ? undefined : uuid(n) });

test("synchronous SHA-256 matches crypto.subtle (empty, short, block edges, 1 MB)", async () => {
  for (const length of [0, 1, 55, 56, 63, 64, 65, 119, 120, 1000, 1_048_576]) {
    const bytes = Uint8Array.from({ length }, (_, i) => (i * 131 + length) & 255);
    const expected = Buffer.from(await crypto.subtle.digest("SHA-256", bytes)).toString("hex");
    assert.equal(sha256HexSync(bytes), expected, `length ${length}`);
  }
});

test("a synchronously made definition is identical to the async one (same hashes; passes the digest check)", async () => {
  const input = { definitionId: uuid(1), name: "Basketball", width: 56, height: 56, pngDataUrl: png("ball") };
  const sync = createDrawingSymbolDefinitionSyncV2(input);
  const asyncMade = await createBitmapSymbolDefinitionV2({ ...input, sourceCategory: "Drawing Symbol" });
  assert.deepEqual(sync, asyncMade);
  await assertStructuredSymbolDigestsV2([sync]);
});

test("Arthur's rule: reuse only when name AND picture match; otherwise 'Name 2'; never change existing symbols", () => {
  const first = add(empty(), "Blue stick figure head", "blue-head", 1);
  assert.equal(first.status, "created");
  const same = add(first.catalogs, "blue stick figure head", "blue-head");
  assert.equal(same.status, "reused");
  assert.equal(same.catalogs, first.catalogs, "nothing added");
  assert.equal(same.definition.definitionId, uuid(1));
  const differentPicture = add(first.catalogs, "Blue stick figure head", "hollow-blue-head", 2);
  assert.equal(differentPicture.status, "created");
  assert.equal(differentPicture.definition.name, "Blue stick figure head 2");
  const again = add(differentPicture.catalogs, "Blue stick figure head", "hollow-blue-head");
  assert.equal(again.status, "reused", "finds its own 'head 2' next time");
  assert.equal(again.definition.definitionId, uuid(2));
  const third = add(differentPicture.catalogs, "Blue stick figure head", "big-blue-head", 3);
  assert.equal(third.definition.name, "Blue stick figure head 3");
  // Same picture, different real names: two separate symbols (Bob's head, Tim's head).
  const bob = add(empty(), "Bob's head", "black-head", 4);
  const tim = add(bob.catalogs, "Tim's head", "black-head", 5);
  assert.equal(tim.status, "created");
  assert.deepEqual(tim.catalogs.symbols.map(symbol => symbol.name), ["Bob's head", "Tim's head"]);
  assert.deepEqual(tim.catalogs.symbols[0], bob.catalogs.symbols[0], "the existing symbol is untouched");
  assert.equal(first.catalogs.symbols.length, 1, "inputs are never changed");
});

test("a user's own symbol with the same name is never reused or changed unless it is the same picture", async () => {
  const userMade = await createBitmapSymbolDefinitionV2({ definitionId: uuid(9), name: "Basketball", sourceCategory: "Drawing Symbol", width: 80, height: 80, pngDataUrl: png("hand-drawn") });
  const catalogs = appendSymbolDefinitionV2(empty(), userMade);
  const engine = add(catalogs, "Basketball", "engine-ball", 10);
  assert.equal(engine.definition.name, "Basketball 2");
  assert.deepEqual(engine.catalogs.symbols[0], userMade);
});

test("refuses empty names, non-PNG pictures and bad sizes", () => {
  assert.throws(() => addEngineLibrarySymbolV2(empty(), { name: "  ", pngDataUrl: png("x"), width: 1, height: 1 }), /symbol_name_required/);
  assert.throws(() => addEngineLibrarySymbolV2(empty(), { name: "Head", pngDataUrl: "data:image/jpeg;base64,AAAA", width: 1, height: 1 }), /symbol_png_required/);
  assert.throws(() => addEngineLibrarySymbolV2(empty(), { name: "Head", pngDataUrl: png("x"), width: 0, height: 1 }), /symbol_size_invalid/);
  assert.throws(() => addEngineLibrarySymbolV2(empty(), { name: "Head", pngDataUrl: png("x"), width: Number.NaN, height: 1 }), /symbol_size_invalid/);
});

test("places centered instances (rotation/flip/size) and keeps the picture's shape when one side is given", () => {
  const { definition } = addEngineLibrarySymbolV2(empty(), { name: "Bat", pngDataUrl: png("bat"), width: 200, height: 50, definitionId: uuid(3) });
  const bat = createSymbolInstanceV2(definition, { centerX: 960, centerY: 540, width: 400, rotation: 30, flipX: true, itemId: uuid(10) });
  assert.deepEqual(bat, {
    itemId: uuid(10), kind: "symbol-instance/v1", definitionId: uuid(3), definitionDigest: definition.definitionDigest,
    x: 760, y: 490, width: 400, height: 100, rotation: 30, flipX: true, flipY: false,
  });
  const byHeight = createSymbolInstanceV2(definition, { centerX: 0, centerY: 0, height: 10 });
  assert.equal(byHeight.width, 40);
  assert.throws(() => createSymbolInstanceV2(definition, { centerX: Number.NaN, centerY: 0 }), /symbol_placement_invalid/);
  assert.throws(() => createSymbolInstanceV2(definition, { centerX: 0, centerY: 0, width: -1 }), /symbol_placement_invalid/);
  const negativeZero = createSymbolInstanceV2(definition, { centerX: 100, centerY: 25, width: 200, height: 50, rotation: -0 });
  assert.ok(!Object.is(negativeZero.x, -0) && !Object.is(negativeZero.y, -0) && !Object.is(negativeZero.rotation, -0), "no -0 (the saved-project check refuses it)");
});

test("engine frames with symbols still pass the saved-project check (format unchanged)", () => {
  const head = addEngineLibrarySymbolV2(empty(), { name: "Dark Lord's head", pngDataUrl: png("head"), width: 80, height: 80, definitionId: uuid(4) });
  const ball = addEngineLibrarySymbolV2(head.catalogs, { name: "Basketball", pngDataUrl: png("ball"), width: 60, height: 60, definitionId: uuid(5) });
  const catalogs = ball.catalogs;
  const byCell = addSymbolInstancesToCellsV2({}, [
    { cellKey: symbolCellKeyV2("layer-1", 7), instances: [createSymbolInstanceV2(head.definition, { centerX: 500, centerY: 300, width: 80, itemId: uuid(20) }), createSymbolInstanceV2(ball.definition, { centerX: 600, centerY: 700, width: 60, itemId: uuid(21) })] },
    { cellKey: symbolCellKeyV2("layer-1", 8), instances: [createSymbolInstanceV2(ball.definition, { centerX: 640, centerY: 650, width: 60, rotation: 45, itemId: uuid(22) })] },
  ], catalogs);
  assert.deepEqual(Object.keys(byCell), ["layer-1:7", "layer-1:8"]);
  // Same shape buildUnifiedProjectSnapshot writes: a keyframe cell whose items are only symbol instances.
  const document: UnifiedAnimationDocumentV2 = {
    kind: "diamond-animation-document", schemaVersion: 2, projectId: uuid(100),
    logicalStage: { width: 1920, height: 1080, origin: "top-left", xAxis: "right", yAxis: "down" },
    fps: 12,
    layers: [{ layerId: uuid(200), name: "AI: test", orderIndex: 0, visible: true, locked: false, cells: [
      { cellId: uuid(300), cellType: "keyframe", ownerCellId: uuid(300), content: { items: byCell["layer-1:7"], soundAttachment: null } },
      { cellId: uuid(301), cellType: "keyframe", ownerCellId: uuid(301), content: { items: byCell["layer-1:8"], soundAttachment: null } },
    ] }],
    catalogs,
    toolState: { drawingTool: "Brush", stickTool: "select" },
    reopenState: { activeLayerId: uuid(200), currentFrameIndex: 0, onionEnabled: false },
  };
  assert.doesNotThrow(() => assertUnifiedAnimationDocumentV2(document));
});

test("refuses instances of unknown/changed symbols and duplicate item ids; never edits the input", () => {
  const { catalogs, definition } = addEngineLibrarySymbolV2(empty(), { name: "Car", pngDataUrl: png("car"), width: 300, height: 120, definitionId: uuid(6) });
  const car = createSymbolInstanceV2(definition, { centerX: 1, centerY: 2, itemId: uuid(30) });
  const existing = { "layer-1:1": [car] };
  assert.throws(() => addSymbolInstancesToCellsV2(existing, [{ cellKey: "layer-1:2", instances: [car] }], catalogs), /symbol_instance_duplicate/);
  assert.throws(() => addSymbolInstancesToCellsV2({}, [{ cellKey: "layer-1:2", instances: [{ ...car, definitionDigest: `sha256:${"0".repeat(64)}` }] }], catalogs), /symbol_definition_missing/);
  const next = addSymbolInstancesToCellsV2(existing, [{ cellKey: "layer-1:1", instances: [{ ...car, itemId: uuid(31) }] }], catalogs);
  assert.equal(next["layer-1:1"].length, 2, "added after what the user already placed");
  assert.equal(existing["layer-1:1"].length, 1);
});

test("renders a drawing function into a PNG data URL (canvas injected for Node)", () => {
  const drawn: string[] = [];
  const fakeCanvas = {
    width: 0, height: 0,
    getContext: () => ({ fillRect: () => drawn.push("fillRect") }) as unknown as CanvasRenderingContext2D,
    toDataURL: () => "data:image/png;base64,AAAA",
  };
  const url = renderSymbolPngDataUrlV2(64, 32, ctx => ctx.fillRect(0, 0, 64, 32), () => fakeCanvas);
  assert.equal(url, "data:image/png;base64,AAAA");
  assert.deepEqual([fakeCanvas.width, fakeCanvas.height, drawn], [64, 32, ["fillRect"]]);
  assert.throws(() => renderSymbolPngDataUrlV2(0, 10, () => undefined, () => fakeCanvas), /symbol_size_invalid/);
});
