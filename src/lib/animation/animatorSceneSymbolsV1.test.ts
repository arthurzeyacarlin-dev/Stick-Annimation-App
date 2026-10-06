import assert from "node:assert/strict";
import { test } from "node:test";
import type { UnifiedProjectCatalogsV2 } from "./unifiedAnimationContractV2";

// Node has no ImageData; a minimal stand-in is enough for the frame-picture code.
class TestImageData {
  width: number; height: number; data: Uint8ClampedArray;
  constructor(dataOrWidth: Uint8ClampedArray | number, width: number, height?: number) {
    if (typeof dataOrWidth === "number") { this.width = dataOrWidth; this.height = width; this.data = new Uint8ClampedArray(dataOrWidth * width * 4); }
    else { this.data = dataOrWidth; this.width = width; this.height = height ?? dataOrWidth.length / 4 / width; }
  }
}
(globalThis as unknown as { ImageData: typeof TestImageData }).ImageData = TestImageData;

const {
  buildAnimatorSymbolTracksV1, colorNameV1, engineToSymbolStageV1, headSymbolNameV1, isRealCharacterNameV1,
  objectSymbolNameV1, prepareAnimatorSceneSymbolsV1, SYMBOL_PICTURE_PIXELS_PER_UNIT,
} = await import("./animatorSceneSymbolsV1.ts");
const SYMBOL_RENDER = await import("./unifiedSymbolRenderV2.ts");
const { resolveSymbolInstanceMatrixV2, resolveSymbolStagePresentationV2 } = SYMBOL_RENDER;
const { createSymbolInstanceV2 } = await import("./unifiedSymbolLibraryV2.ts");
const { resolveExportRasterTransform, resolveExportSymbolTransform, resolveUniformContainTransform } = await import("../export/exportContracts.ts");
const { buildScene } = await import("../animator/engine.ts");
const { ballLook } = await import("../animator/objects.ts");
const { drawFrame, drawHead } = await import("../animator/render.ts");
const { DEFAULT_STYLE, STAND, withPose } = await import("../animator/rig.ts");
const { centerAnimation, visibleStageWidth } = await import("../animator/stageFit.ts");
const { rasterizeFrames } = await import("../animator/toFrames.ts");
type Scene = import("../animator/engine.ts").Scene;
type SceneCharacter = import("../animator/engine.ts").SceneCharacter;

const close = (actual: number, expected: number, tolerance: number, message: string) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);

// Window shapes: wide, exactly 16:9, the review window (narrow), tall phone.
const PAGES = [{ width: 1600, height: 700 }, { width: 1600, height: 900 }, { width: 772, height: 626 }, { width: 400, height: 800 }];

// applyAnimatorScene's picture mapping (engine stage -> page CSS px), copied from the workspace.
const pagePoint = (page: { width: number; height: number }, x: number, y: number) => {
  const k = page.height / 1080;
  return { x: page.width / 2 + (x - 960) * k, y: y * k };
};

test("a head/ball placed from engine coordinates lands on the same page pixel as the body picture (wide, 16:9, narrow, tall)", () => {
  for (const page of PAGES) {
    const toSymbol = engineToSymbolStageV1(page.width, page.height)!;
    // The overlay and Play use this presentation (stage fitted whole in the page).
    const presentation = resolveSymbolStagePresentationV2({ left: 0, top: 0, width: page.width, height: page.height })!;
    for (const [x, y, size] of [[960, 540, 50], [400, 900, 30], [1700, 120, 70], [-200, -40, 10]]) {
      const center = toSymbol.point(x, y);
      const instance = { x: center.x - (size * toSymbol.scale) / 2, y: center.y - (size * toSymbol.scale) / 2, width: size * toSymbol.scale, height: size * toSymbol.scale, rotation: 0, flipX: false, flipY: false };
      const [a, , , d, e, f] = resolveSymbolInstanceMatrixV2(instance, presentation);
      const want = pagePoint(page, x, y);
      close(e, want.x, 1e-6, `x on ${page.width}x${page.height}`);
      close(f, want.y, 1e-6, `y on ${page.width}x${page.height}`);
      close(a * instance.width, size * (page.height / 1080), 1e-6, "size");
      close(d * instance.height, size * (page.height / 1080), 1e-6, "size");
    }
  }
});

test("export puts those symbols on the body too (raster page mapping), where the old stage fit drifted on non-16:9 pages", () => {
  for (const page of PAGES) for (const dpr of [1, 2]) for (const [outW, outH] of [[1920, 1080], [1280, 720], [1080, 1920]]) {
    // The editor's drawing canvas: the 4.6x authoring world at device pixels.
    const refW = Math.floor(page.width * 4.6 * dpr), refH = Math.floor(page.height * 4.6 * dpr);
    const worldLeft = ((1 - 4.6) / 2) * page.width, worldTop = ((1 - 4.6) / 2) * page.height;
    const ppc = refW / (page.width * 4.6);
    const k = page.height / 1080;
    const map = { scale: k * ppc, offsetX: (page.width / 2 - 960 * k - worldLeft) * ppc, offsetY: (0 - worldTop) * ppc };
    const raster = resolveExportRasterTransform(outW, outH, refW, refH, 4.6);
    const symbols = resolveExportSymbolTransform(outW, outH, refW, refH, 4.6);
    const stage = resolveUniformContainTransform(outW, outH, 1920, 1080);
    const toSymbol = engineToSymbolStageV1(page.width, page.height)!;
    let oldDrift = 0;
    for (const [x, y] of [[960, 540], [500, 860], [1500, 200]]) {
      const bodyX = raster.offsetX + (map.offsetX + x * map.scale) * raster.scaleX;
      const bodyY = raster.offsetY + (map.offsetY + y * map.scale) * raster.scaleY;
      const u = toSymbol.point(x, y);
      // Within one drawing-canvas pixel (its size is rounded down to whole pixels).
      const tolerance = Math.max(0.5, raster.scaleX);
      close(symbols.offsetX + u.x * symbols.scaleX, bodyX, tolerance, `export x ${page.width}x${page.height}@${dpr} -> ${outW}x${outH}`);
      close(symbols.offsetY + u.y * symbols.scaleY, bodyY, tolerance, `export y ${page.width}x${page.height}@${dpr} -> ${outW}x${outH}`);
      oldDrift = Math.max(oldDrift, Math.hypot(stage.offsetX + u.x * stage.scaleX - bodyX, stage.offsetY + u.y * stage.scaleY - bodyY));
    }
    if (page.width / page.height === 16 / 9) {
      // A 16:9 page (any video shape): the stage IS the page, so nothing changes.
      assert.ok(oldDrift < 0.5, "16:9 page: same as before");
      for (const key of ["offsetX", "offsetY"] as const) close(symbols[key], stage[key], 0.5, `unchanged ${key}`);
      for (const key of ["scaleX", "scaleY"] as const) close(symbols[key], stage[key], 0.002 * stage[key], `unchanged ${key}`);
    } else if (outW / outH === 16 / 9) assert.ok(oldDrift > 50, `a 16:9 video from a non-16:9 page: the old stage fit was off by ${oldDrift.toFixed(1)} px`);
  }
});

test("heads stay on the bodies when the window/canvas area changes size later (drawingCanvas), in the editor, Play and export", () => {
  const { instancePresentationV2, referenceStageScaleV2 } = SYMBOL_RENDER;
  for (const page of PAGES) for (const dpr of [1, 2]) {
    // Apply time: the drawing canvas R and the AI picture mapping, as in applyAnimatorScene.
    const R = { width: Math.floor(page.width * 4.6 * dpr), height: Math.floor(page.height * 4.6 * dpr) };
    const ppc = R.width / (page.width * 4.6), k = page.height / 1080;
    const map = { scale: k * ppc, offsetX: (page.width / 2 - 960 * k + 1.8 * page.width) * ppc, offsetY: (1.8 * page.height) * ppc };
    const toSymbol = engineToSymbolStageV1(page.width, page.height)!;
    const unit = referenceStageScaleV2(R);
    for (const later of [page, { width: page.width * 1.3, height: page.height * 0.8 }, { width: page.width * 0.7, height: page.height * 1.25 }]) {
      // Later the canvas is C; drawings keep their canvas-pixel distance from the middle (centered pictures).
      const C = { width: Math.floor(later.width * 4.6 * dpr), height: Math.floor(later.height * 4.6 * dpr) };
      for (const [x, y] of [[960, 540], [500, 860], [1500, 200]]) {
        const drawingX = map.offsetX + x * map.scale - Math.floor(R.width / 2) + Math.floor(C.width / 2);
        const drawingY = map.offsetY + y * map.scale - Math.floor(R.height / 2) + Math.floor(C.height / 2);
        const u = toSymbol.point(x, y);
        // Onion/overlay (canvas pixels): the remembered stage size, around the canvas middle.
        close(C.width / 2 + (u.x - 960) * unit, drawingX, 1, `canvas x ${JSON.stringify(later)}@${dpr}`);
        close(C.height / 2 + (u.y - 540) * unit, drawingY, 1, `canvas y ${JSON.stringify(later)}@${dpr}`);
        // Play: the playback view shows the world at `perCanvasPixel` CSS px per canvas pixel.
        const world = { left: -1.8 * later.width, top: -1.8 * later.height, width: 4.6 * later.width, height: 4.6 * later.height };
        const view = { centerX: world.left + world.width / 2, centerY: world.top + world.height / 2, perCanvasPixel: world.width / C.width };
        const p = instancePresentationV2({ drawingCanvas: R }, { scale: 1, offsetX: 0, offsetY: 0 }, view);
        // (within one canvas pixel: the canvas size is rounded down to whole pixels)
        close(p.offsetX + u.x * p.scale, world.left + drawingX * view.perCanvasPixel, view.perCanvasPixel, "play x");
        close(p.offsetY + u.y * p.scale, world.top + drawingY * (world.height / C.height), view.perCanvasPixel, "play y");
        // Export: the cell's drawing was saved on canvas C (frame reference); the instance still remembers R.
        const raster = resolveExportRasterTransform(1920, 1080, C.width, C.height, 4.6);
        const symbols = resolveExportSymbolTransform(1920, 1080, C.width, C.height, 4.6, R);
        close(symbols.offsetX + u.x * symbols.scaleX, raster.offsetX + drawingX * raster.scaleX, Math.max(0.6, raster.scaleX), "export x");
        close(symbols.offsetY + u.y * symbols.scaleY, raster.offsetY + drawingY * raster.scaleY, Math.max(0.6, raster.scaleY), "export y");
      }
    }
  }
  // Without drawingCanvas nothing changes (the view's normal stage fit).
  const base = { scale: 0.5, offsetX: 3, offsetY: 4 };
  assert.equal(instancePresentationV2({}, base, { centerX: 1, centerY: 2, perCanvasPixel: 0.5 }), base);
});

test("the saved-project check accepts a valid drawingCanvas and refuses a bad one; old instances need none", async () => {
  const { assertUnifiedAnimationDocumentV2 } = await import("./unifiedAnimationContractV2.ts");
  const { addEngineLibrarySymbolV2 } = await import("./unifiedSymbolLibraryV2.ts");
  const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const { catalogs, definition } = addEngineLibrarySymbolV2({ symbols: [], assets: [] }, { name: "Basketball", pngDataUrl: `data:image/png;base64,${Buffer.from("ball").toString("base64")}`, width: 50, height: 50, definitionId: uuid(1) });
  const documentWith = (extra: object) => ({
    kind: "diamond-animation-document", schemaVersion: 2, projectId: uuid(2),
    logicalStage: { width: 1920, height: 1080, origin: "top-left", xAxis: "right", yAxis: "down" }, fps: 12,
    layers: [{ layerId: uuid(3), name: "AI", orderIndex: 0, visible: true, locked: false, cells: [{ cellId: uuid(4), cellType: "keyframe", ownerCellId: uuid(4),
      content: { items: [{ ...createSymbolInstanceV2(definition, { centerX: 10, centerY: 10, itemId: uuid(5) }), ...extra }], soundAttachment: null } }] }],
    catalogs, toolState: { drawingTool: "Brush", stickTool: "select" }, reopenState: { activeLayerId: uuid(3), currentFrameIndex: 0, onionEnabled: false },
  }) as never;
  assert.doesNotThrow(() => assertUnifiedAnimationDocumentV2(documentWith({})));
  assert.doesNotThrow(() => assertUnifiedAnimationDocumentV2(documentWith({ drawingCanvas: { width: 3845, height: 2603 } })));
  for (const bad of [{ width: 0, height: 10 }, { width: 1.5, height: 10 }, null, "big"]) {
    assert.throws(() => assertUnifiedAnimationDocumentV2(documentWith({ drawingCanvas: bad })), /invalid_record/);
  }
});

test("names: real names → \"<Name>'s head\"; test-kit/role names and ids → \"<Color> stick figure head\"", () => {
  assert.equal(isRealCharacterNameV1("Dark Lord", "a"), true);
  for (const [name, id] of [["a", "a"], ["Mover", "a"], ["Left", "a"], ["Right", "b"], ["Runner", "a"], ["Red", "a"], ["Figure 2", "f2"], ["", "x"], [undefined, "x"]] as const) {
    assert.equal(isRealCharacterNameV1(name, id), false, String(name));
  }
  assert.equal(headSymbolNameV1({ id: "a", name: "Dark Lord", style: { color: "#111111" } }), "Dark Lord's head");
  assert.equal(headSymbolNameV1({ id: "b", name: "Right", style: { color: "#2563eb" } }), "Blue stick figure head");
  assert.equal(headSymbolNameV1({ id: "a", name: "a", style: { color: "#e02424" } }), "Red stick figure head");
  // The Color menu's names; other colors get the nearest one.
  assert.equal(colorNameV1("#111111"), "Black");
  assert.equal(colorNameV1("#1f5fbf"), "Blue");
  assert.equal(colorNameV1("#d23a52"), "Red");
  assert.equal(colorNameV1("#7c3aed"), "Purple");
  assert.equal(colorNameV1("#6b7280"), "Gray");
  assert.equal(objectSymbolNameV1({ id: "ball", name: "ball", look: ballLook("basketball") }), "Basketball");
  assert.equal(objectSymbolNameV1({ id: "ball", name: "Ball", look: ballLook("ball") }), "Red ball");
  assert.equal(objectSymbolNameV1({ id: "o1", name: "Soccer ball", look: ballLook("ball") }), "Soccer ball");
});

// A self-contained pass: two figures, a basketball held, thrown with spin, caught.
const ARMS = withPose(STAND, { lShoulder: 75, rShoulder: 85, lElbow: 20, rElbow: 15 });
const BOTH: ("lFoot" | "rFoot")[] = ["lFoot", "rFoot"];
const figure = (id: string, name: string, facing: "left" | "right", x: number, color: string): SceneCharacter => ({
  id, name, facing, height: 300, style: { ...DEFAULT_STYLE, color },
  keys: [{ t: 0, x, pose: ARMS, contacts: BOTH }, { t: 0.9, x: x + 20, pose: withPose(ARMS, { lShoulder: 105, rShoulder: 112, lean: 8 }), contacts: BOTH }, { t: 2.5, x, pose: ARMS, contacts: BOTH }],
});
const passScene = (names: [string, string]): Scene => ({
  id: "pass", title: "Pass", durationSec: 2.5, groundY: 900,
  characters: [figure("a", names[0], "right", 700, "#111111"), figure("b", names[1], "left", 1200, "#2563eb")],
  objects: [{ id: "ball", name: "ball", look: ballLook("basketball"), keys: [], segments: [
    { from: 0, to: 1.0, mode: "held", character: "a", joint: "hands" },
    { from: 1.0, to: 1.6, mode: "flight", apex: 120, spin: 1 },
    { from: 1.6, to: 2.5, mode: "held", character: "b", joint: "hands" },
  ] }],
});

test("one head per figure and one ball per frame, centered on the engine's head and ball", () => {
  const page = { width: 772, height: 626 };
  const built = buildScene(passScene(["Left", "Right"]), 12);
  const centered = centerAnimation(built.frames, visibleStageWidth(page.width, page.height), built.objects);
  const tracks = buildAnimatorSymbolTracksV1(passScene(["Left", "Right"]), centered.frames, centered.objects, page)!;
  assert.deepEqual([...tracks.pictures.values()].map(picture => picture.name), ["Black stick figure head", "Blue stick figure head", "Basketball"]);
  const toSymbol = engineToSymbolStageV1(page.width, page.height)!;
  assert.equal(tracks.placements.length, centered.frames.length);
  for (const [index, placements] of tracks.placements.entries()) {
    assert.equal(placements.length, 3);
    const [headA, headB, ball] = placements;
    for (const [placement, character] of [[headA, centered.frames[index][0]], [headB, centered.frames[index][1]]] as const) {
      const want = toSymbol.point(character.skeleton.head.x, character.skeleton.head.y);
      close(placement.centerX, want.x, 1e-9, "head x"); close(placement.centerY, want.y, 1e-9, "head y");
      // The picture holds the head circle plus half the line and a small margin.
      const picture = tracks.pictures.get(placement.pictureKey)!;
      assert.ok(picture.boxUnits >= 2 * (character.headRadius + character.style.thickness / 2));
      close(placement.width, picture.boxUnits * toSymbol.scale, 1e-9, "head size");
    }
    const object = centered.objects![index][0];
    const want = toSymbol.point(object.x, object.y);
    close(ball.centerX, want.x, 1e-9, "ball x"); close(ball.centerY, want.y, 1e-9, "ball y");
    assert.equal(ball.rotation, object.scaleX === object.scaleY ? object.rotation : 0);
  }
  // The spin shows up as instance rotation.
  assert.ok(tracks.placements.some(([, , ball]) => Math.abs(ball.rotation) > 1));
});

test("an uneven squash is shown upright with the squash in width/height", () => {
  const page = { width: 1600, height: 900 };
  const frames = [[]] as never[][];
  const look = ballLook("basketball");
  const objects = [[{ id: "ball", x: 900, y: 800, rotation: 40, scaleX: 1.3, scaleY: 0.7, look }]];
  const tracks = buildAnimatorSymbolTracksV1({ characters: [], objects: [{ id: "ball", name: "ball", look, keys: [] }] }, frames, objects, page)!;
  const [ball] = tracks.placements[0];
  const box = [...tracks.pictures.values()][0].boxUnits;
  assert.equal(ball.rotation, 0);
  close(ball.width, box * 1.3, 1e-9, "squash width"); close(ball.height, box * 0.7, 1e-9, "squash height");
});

// A recording 2D context (and a fake canvas that turns the recorded drawing into "PNG" bytes, so
// the same drawing always gives the same picture, like a real browser).
const recorder = () => {
  const calls: string[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_target, key) => (...args: unknown[]) => { calls.push(`${String(key)}(${args.map(a => typeof a === "number" ? +a.toFixed(6) : JSON.stringify(a)).join(",")})`); },
    set: (_target, key, value) => { calls.push(`${String(key)}=${typeof value === "number" ? +value.toFixed(6) : value}`); return true; },
  });
  return { ctx, calls };
};
const fakeCanvas = () => {
  const { ctx, calls } = recorder();
  const canvas = { width: 0, height: 0, getContext: () => ctx as unknown as CanvasRenderingContext2D,
    toDataURL: () => `data:image/png;base64,${Buffer.from(`${canvas.width}x${canvas.height}|${calls.join(";")}`).toString("base64")}` };
  return canvas;
};

test("drawHead draws exactly what drawFrame draws for a head; skipHeads leaves only the heads out", () => {
  const built = buildScene(passScene(["Left", "Right"]), 12);
  const characters = built.frames[5];
  const map = { scale: 2.5, offsetX: 30, offsetY: -12 };
  const full = recorder(), noHeads = recorder(), defaultOptions = recorder();
  drawFrame(full.ctx as never, characters, map, built.objects[5]);
  drawFrame(defaultOptions.ctx as never, characters, map, built.objects[5], {});
  drawFrame(noHeads.ctx as never, characters, map, built.objects[5], { skipHeads: true });
  assert.deepEqual(defaultOptions.calls, full.calls, "default unchanged");
  const arcs = (calls: string[]) => calls.filter(call => call.startsWith("arc("));
  const headArcs = characters.map(c => `arc(${+c.skeleton.head.x.toFixed(6)},${+c.skeleton.head.y.toFixed(6)},${+c.headRadius.toFixed(6)},0,${+(Math.PI * 2).toFixed(6)})`);
  for (const head of headArcs) assert.ok(full.calls.includes(head) && !noHeads.calls.includes(head));
  assert.equal(arcs(noHeads.calls).length, arcs(full.calls).length - characters.length, "only the heads are gone (ball still drawn)");
  // drawHead: same style settings and the same arc/fill/stroke as drawFrame's head.
  for (const character of characters) {
    const head = recorder();
    drawHead(head.ctx as never, character, character.skeleton.head, map);
    const at = full.calls.indexOf(headArcs[characters.indexOf(character)]);
    const tail = full.calls.slice(at - 1, at + (character.style.headFilled ? 3 : 2));
    assert.deepEqual(head.calls.slice(head.calls.indexOf("beginPath()"), head.calls.indexOf("beginPath()") + tail.length), tail);
    for (const setting of [`strokeStyle=${character.style.color}`, `fillStyle=${character.style.color}`, `lineWidth=${character.style.thickness}`, `setTransform(${map.scale},0,0,${map.scale},${map.offsetX},${map.offsetY})`]) {
      assert.ok(head.calls.includes(setting), setting);
    }
  }
});

test("rasterizeFrames: no options = unchanged; skip options drop heads/objects but keep the same holds", () => {
  const drawn: string[][] = [];
  (globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
    width: number; height: number; calls: string[];
    constructor(width: number, height: number) { this.width = width; this.height = height; this.calls = []; drawn.push(this.calls); }
    getContext() {
      const { ctx, calls } = recorder();
      const canvasCalls = this.calls, size = this.width * this.height * 4;
      return new Proxy(ctx, { get: (target, key) => key === "getImageData" ? () => { canvasCalls.push(...calls); return { data: new Uint8ClampedArray(size) }; } : (target as Record<string | symbol, unknown>)[key] });
    }
  };
  try {
    const built = buildScene(passScene(["Left", "Right"]), 12);
    const map = { scale: 1.2, offsetX: 100, offsetY: 50 };
    const run = (options?: object) => { drawn.length = 0; const out = rasterizeFrames(built.frames, 4000, 3000, map, built.objects, options as never); return { holds: out.map(entry => entry.hold), calls: drawn.map(c => c.join(";")) }; };
    const plain = run(), explicitDefault = run({}), skipped = run({ skipHeads: true, skipObjects: true });
    assert.deepEqual(explicitDefault, plain);
    assert.deepEqual(skipped.holds, plain.holds, "same holds");
    assert.ok(plain.calls.every(calls => calls.includes("arc(")));
    assert.ok(skipped.calls.every(calls => !calls.includes("arc(")), "no head circles and no ball in the pictures");
  } finally {
    delete (globalThis as unknown as { OffscreenCanvas?: unknown }).OffscreenCanvas;
  }
});

test("prepare: makes the three symbols once, reuses them for the next scene, never touches a user's 'Basketball'", () => {
  const page = { width: 772, height: 626 };
  const scene = passScene(["Left", "Right"]);
  const built = buildScene(scene, 12);
  const centered = centerAnimation(built.frames, visibleStageWidth(page.width, page.height), built.objects);
  const empty: UnifiedProjectCatalogsV2 = { symbols: [], assets: [] };
  const first = prepareAnimatorSceneSymbolsV1(scene, centered.frames, centered.objects, page, empty, fakeCanvas)!;
  assert.deepEqual(first.catalogs.symbols.map(symbol => symbol.name), ["Black stick figure head", "Blue stick figure head", "Basketball"]);
  for (const symbol of first.catalogs.symbols) {
    assert.equal(symbol.sourceCategory, "Drawing Symbol");
    assert.ok(symbol.width >= 1 && Number.isInteger(symbol.width));
  }
  const picture = [...first.definitions.values()][0];
  assert.ok(Buffer.from(picture.pngDataUrl.split(",")[1], "base64").toString().startsWith(`${Math.ceil(2 * (built.frames[0][0].headRadius + 3.5 + 2) * SYMBOL_PICTURE_PIXELS_PER_UNIT)}x`));
  // Next scene, same looks: nothing new.
  const second = prepareAnimatorSceneSymbolsV1(scene, centered.frames, centered.objects, page, first.catalogs, fakeCanvas)!;
  assert.equal(second.catalogs.symbols.length, 3);
  assert.deepEqual([...second.definitions.values()].map(d => d.definitionId), [...first.definitions.values()].map(d => d.definitionId));
  // Real names → their own head symbols.
  const named = passScene(["Dark Lord", "Blue Knight"]);
  const third = prepareAnimatorSceneSymbolsV1(named, centered.frames, centered.objects, page, first.catalogs, fakeCanvas)!;
  assert.deepEqual(third.catalogs.symbols.map(symbol => symbol.name).slice(3), ["Dark Lord's head", "Blue Knight's head"]);
  // Instances made from the placements are valid saved-project items.
  const instance = createSymbolInstanceV2(first.definitions.get(first.placements[0][2].pictureKey)!, first.placements[0][2]);
  assert.equal(instance.kind, "symbol-instance/v1");
  // Nothing to make (no figures, no objects) → null: the frames are drawn as before.
  assert.equal(prepareAnimatorSceneSymbolsV1({ characters: [], objects: [] }, [[]], [[]], page, empty, fakeCanvas), null);
  // A failure (no canvas) → null, never a half-made Library.
  const quiet = console.warn; console.warn = () => undefined;
  try { assert.equal(prepareAnimatorSceneSymbolsV1(scene, centered.frames, centered.objects, page, empty, () => { throw new Error("no canvas"); }), null); }
  finally { console.warn = quiet; }
});
