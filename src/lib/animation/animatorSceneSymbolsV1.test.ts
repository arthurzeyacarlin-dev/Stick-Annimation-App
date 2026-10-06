import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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

test("names: a name the USER gave → \"<Name>'s head\"; engine/test-kit names and ids → \"<Color> stick figure head\"", () => {
  assert.equal(isRealCharacterNameV1("Dark Lord", "a"), true);
  for (const [name, id] of [["a", "a"], ["Mover", "a"], ["Left", "a"], ["Right", "b"], ["Runner", "a"], ["Red", "a"], ["Figure 2", "f2"], ["", "x"], [undefined, "x"]] as const) {
    assert.equal(isRealCharacterNameV1(name, id), false, String(name));
  }
  assert.equal(headSymbolNameV1({ id: "a", name: "Dark Lord", namedByUser: true, style: { color: "#111111" } }), "Dark Lord's head");
  // SYMBOL NAMES (Arthur, 2026-10-06): a name the engine or a test scene made up is never used.
  for (const [name, color, want] of [["Dark Lord", "#111111", "Black"], ["Hero", "#111111", "Black"], ["Officer", "#2563eb", "Blue"], ["Red (laser)", "#e02424", "Red"], ["Blue (ice)", "#2563eb", "Blue"]] as const) {
    assert.equal(headSymbolNameV1({ id: "a", name, style: { color } }), `${want} stick figure head`, name);
  }
  assert.equal(headSymbolNameV1({ id: "a", name: "Red", namedByUser: true, style: { color: "#e02424" } }), "Red stick figure head", "a color word is not a name");
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
  // Names the user gave → their own head symbols.
  const named = passScene(["Dark Lord", "Blue Knight"]);
  const third = prepareAnimatorSceneSymbolsV1({ ...named, characters: named.characters.map(c => ({ ...c, namedByUser: true })) }, centered.frames, centered.objects, page, first.catalogs, fakeCanvas)!;
  assert.deepEqual(third.catalogs.symbols.map(symbol => symbol.name).slice(3), ["Dark Lord's head", "Blue Knight's head"]);
  // The same names made up by the engine (not the user) → the color heads already there, nothing new.
  assert.equal(prepareAnimatorSceneSymbolsV1(named, centered.frames, centered.objects, page, first.catalogs, fakeCanvas)!.catalogs.symbols.length, 3);
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

test("original symbols (Phase 2C): a made prop becomes a normal Library symbol (picture + size), reused when identical", async () => {
  const { addMadeSymbolToLibraryV1 } = await import("./animatorSceneSymbolsV1.ts");
  const { makeSymbol } = await import("../animator/symbolMaker.ts");
  const empty: UnifiedProjectCatalogsV2 = { symbols: [], assets: [] };
  const bat = makeSymbol({ name: "Bat", kind: "bat", seed: 1 });
  const first = addMadeSymbolToLibraryV1(empty, bat, { createCanvas: fakeCanvas });
  assert.equal(first.status, "created");
  assert.equal(first.definition.name, "Bat");
  assert.equal(first.definition.sourceCategory, "Drawing Symbol");
  assert.deepEqual(Object.keys(first.definition).sort(), Object.keys(empty.symbols[0] ?? first.definition).sort());
  assert.equal(first.definition.width, Math.round(bat.width + 4));
  assert.equal(first.definition.height, Math.round(bat.height + 4));
  assert.equal(addMadeSymbolToLibraryV1(first.catalogs, bat, { createCanvas: fakeCanvas }).status, "reused");
  const other = addMadeSymbolToLibraryV1(first.catalogs, makeSymbol({ name: "Bat", parts: [{ shape: "circle" }] }), { createCanvas: fakeCanvas });
  assert.equal(other.definition.name, "Bat 2", "same name, different picture");
  assert.equal(empty.symbols.length, 0, "the given catalogs are never changed");
});

test("STILL THINGS ARE SYMBOLS: a flicker bulb is a 'Light bulb' Library symbol placed every frame (not painted); parkour spikes are placements on the background layer", async () => {
  const { prepareEffectSymbolsV1 } = await import("./animatorSceneSymbolsV1.ts");
  const { rasterizeShapeFrames, sceneEffectLayers } = await import("../animator/toFrames.ts");
  const { planToScene } = await import("../animator/moves/plan.ts");
  const { LIBRARY } = await import("../animator/moves/library.ts");
  const { parkourPlan } = await import("../animator/moves/scenes2c.ts");
  const page = { width: 772, height: 626 };
  const empty: UnifiedProjectCatalogsV2 = { symbols: [], assets: [] };
  const toSymbol = engineToSymbolStageV1(page.width, page.height)!;
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
    // The bulb.
    const scene = {
      id: "bulb", title: "Bulb", durationSec: 1, groundY: 900,
      characters: [{ id: "a", name: "a", facing: "right", height: 300, style: DEFAULT_STYLE, keys: [{ t: 0, x: 960, pose: STAND, contacts: ["lFoot", "rFoot"] }] }],
      effects: [{ kind: "flicker", start: 0, end: 1, anchor: { x: 960, y: 420 }, params: { seed: 11 } }],
    } as unknown as Scene;
    const built = buildScene(scene, 12);
    const centered = centerAnimation(built.frames, visibleStageWidth(page.width, page.height), built.objects);
    const layers = sceneEffectLayers(scene, built, centered.shift);
    const plan = prepareEffectSymbolsV1(layers, page, empty, fakeCanvas)!;
    assert.deepEqual(plan.catalogs.symbols.map(symbol => symbol.name), ["Light bulb"]);
    assert.equal(empty.symbols.length, 0, "the given catalogs are never changed");
    assert.equal(plan.effects!.length, built.frames.length);
    for (const [index, fx] of plan.effects!.entries()) {
      assert.equal(fx.front.length, 1, `one bulb in frame ${index}`);
      const shape = layers.effects![index].front.find(s => s.kind === "symbol")!;
      assert.ok(shape.kind === "symbol" && shape.name === "Light bulb");
      const want = toSymbol.point(shape.x, shape.y);
      close(fx.front[0].centerX, want.x, 1e-9, "x"); close(fx.front[0].centerY, want.y, 1e-9, "y");
      assert.ok(plan.definitions.get(fx.front[0].pictureKey), "its Library symbol");
      assert.equal(createSymbolInstanceV2(plan.definitions.get(fx.front[0].pictureKey)!, fx.front[0]).kind, "symbol-instance/v1");
    }
    // The pictures: the bulb (glass #eef2f5, screw base #8a8a8a) is painted only when the symbols are not placed.
    const run = (options: object) => { drawn.length = 0; const out = rasterizeFrames(centered.frames, 1544, 1252, { scale: 1, offsetX: 0, offsetY: 0 }, centered.objects, options as never); return { holds: out.map(entry => entry.hold), calls: drawn.map(c => c.join(";")) }; };
    const painted = run({ effects: layers.effects }), placed = run({ effects: layers.effects, skipSymbolShapes: true });
    assert.deepEqual(placed.holds, painted.holds, "same holds");
    assert.ok(painted.calls.every(calls => calls.includes("#eef2f5") && calls.includes("#8a8a8a")), "without symbols the bulb is painted");
    assert.ok(placed.calls.every(calls => !calls.includes("#eef2f5") && !calls.includes("#8a8a8a")), "no painted bulb pixels");
    assert.ok(placed.calls.some(calls => calls.includes("#fff6d8")), "its light is still drawn");

    // The parkour scene: its spikes are "Spike" placements for the background layer, 2 per row x 3 rows.
    const parkour = planToScene(parkourPlan(), LIBRARY);
    const parkourBuilt = buildScene(parkour, 12);
    const parkourCentered = centerAnimation(parkourBuilt.frames, visibleStageWidth(page.width, page.height), parkourBuilt.objects);
    const parkourLayers = sceneEffectLayers(parkour, parkourBuilt, parkourCentered.shift);
    const parkourPlanned = prepareEffectSymbolsV1(parkourLayers, page, empty, fakeCanvas)!;
    assert.deepEqual(parkourPlanned.catalogs.symbols.map(symbol => symbol.name), ["Spike"]);
    assert.equal(parkourPlanned.effects, undefined, "no effects");
    assert.equal(parkourPlanned.background!.length, parkourBuilt.frames.length);
    assert.ok(parkourPlanned.background!.every(list => list.length === 6), "6 spikes in every frame");
    // (The recording canvas has no gradients, so the sky and ground gradients are left out here.)
    const backgroundRun = (options: object) => { drawn.length = 0; rasterizeShapeFrames(parkourLayers.background!.slice(0, 3).map(list => list.filter(shape => shape.kind !== "rect" || !shape.fill2)), 1544, 1252, { scale: 0.5, offsetX: 0, offsetY: 0 }, options); return drawn.map(c => c.join(";")); };
    assert.ok(backgroundRun({}).some(calls => calls.includes("#a7b0bb")), "without symbols the spikes are painted");
    assert.ok(backgroundRun({ skipSymbolShapes: true }).every(calls => !calls.includes("#a7b0bb")), "no painted spikes");
    // A plain scene has nothing to place.
    assert.equal(prepareEffectSymbolsV1({}, page, empty, fakeCanvas), null);
  } finally {
    delete (globalThis as unknown as { OffscreenCanvas?: unknown }).OffscreenCanvas;
  }
});

test("NO NEAR-DUPLICATE SYMBOLS: nearly the same look reuses the symbol; a really different color or shape gets its own", async () => {
  const { addMadeSymbolToLibraryV1, colorDifferenceV1, NEAR_COLOR_DE } = await import("./animatorSceneSymbolsV1.ts");
  const { placedSymbol } = await import("../animator/symbolMaker.ts");
  const { FIGURE_COLORS } = await import("../animator/colors.ts");
  const empty: UnifiedProjectCatalogsV2 = { symbols: [], assets: [] };
  // "Nearly the same" colors: the test scenes' two reds, two blues, two leaf greens, two laser glows — all a shade apart.
  for (const [a, b] of [["#e2461c", "#e02424"], ["#2a6fdb", "#2563eb"], ["#4c9354", "#45894e"], ["#ff2638", "#ff2626"], ["#fff2f2", "#ffffff"]]) {
    assert.ok(colorDifferenceV1(a, b) <= NEAR_COLOR_DE, `${a} ~ ${b}: ${colorDifferenceV1(a, b)}`);
  }
  // Every two different figure colors (red/orange, blue/purple...) really differ.
  const figureColors = Object.values(FIGURE_COLORS);
  for (const [i, a] of figureColors.entries()) for (const b of figureColors.slice(i + 1)) assert.ok(colorDifferenceV1(a, b) > NEAR_COLOR_DE * 1.5, `${a} vs ${b}`);

  // Leaves a shade apart → one "Leaf"; an autumn leaf → its own "Leaf 2".
  const leaf = addMadeSymbolToLibraryV1(empty, placedSymbol({ name: "Leaf", color: "#4c9354", color2: "#317139" }), { createCanvas: fakeCanvas });
  const nearLeaf = addMadeSymbolToLibraryV1(leaf.catalogs, placedSymbol({ name: "Leaf", color: "#45894e", color2: "#2b6834" }), { createCanvas: fakeCanvas });
  assert.equal(nearLeaf.status, "reused");
  assert.equal(nearLeaf.definition.definitionId, leaf.definition.definitionId);
  assert.deepEqual(nearLeaf.box, leaf.box, "placed at the same size");
  assert.equal(nearLeaf.catalogs.symbols.length, 1);
  const autumn = addMadeSymbolToLibraryV1(nearLeaf.catalogs, placedSymbol({ name: "Leaf", color: "#e07b1c", color2: "#8a4210" }), { createCanvas: fakeCanvas });
  assert.equal(autumn.definition.name, "Leaf 2", "a really different color keeps its own symbol");
  // Laser eyes: a red glow a shade off → one "Laser eye"; a blue one → "Laser eye 2".
  const eye = addMadeSymbolToLibraryV1(empty, placedSymbol({ name: "Laser eye", color: "#ff2626", color2: "#ffffff" }), { createCanvas: fakeCanvas });
  assert.equal(addMadeSymbolToLibraryV1(eye.catalogs, placedSymbol({ name: "Laser eye", color: "#ff2638", color2: "#fff2f2" }), { createCanvas: fakeCanvas }).status, "reused");
  assert.equal(addMadeSymbolToLibraryV1(eye.catalogs, placedSymbol({ name: "Laser eye", color: "#2f7bff", color2: "#ffffff" }), { createCanvas: fakeCanvas }).definition.name, "Laser eye 2");
  // A user's own symbol called "Leaf" (not made by the engine) is never taken over.
  const users: UnifiedProjectCatalogsV2 = { symbols: [{ ...leaf.definition, definitionId: "user-leaf", assetSha256: "f".repeat(64), definitionDigest: "user" }], assets: [] };
  assert.equal(addMadeSymbolToLibraryV1(users, placedSymbol({ name: "Leaf", color: "#3f9b4a" }), { createCanvas: fakeCanvas }).definition.name, "Leaf 2");

  // Heads: a red a shade off → the same "Red stick figure head"; a hollow head is a different shape → its own.
  const page = { width: 772, height: 626 };
  const one = (color: string, extra: Partial<SceneCharacter["style"]> = {}, height = 300): [Scene, SceneCharacter] => {
    const character = { ...figure("a", "Officer", "right", 900, color), height, style: { ...DEFAULT_STYLE, color, ...extra } };
    return [{ id: "h", title: "h", durationSec: 1, groundY: 900, characters: [character] } as Scene, character];
  };
  const prep = (scene: Scene, catalogs: UnifiedProjectCatalogsV2) => {
    const built = buildScene(scene, 12);
    return { built, out: prepareAnimatorSceneSymbolsV1(scene, built.frames, built.objects, page, catalogs, fakeCanvas)! };
  };
  const red = prep(one("#e2461c")[0], empty).out;
  assert.deepEqual(red.catalogs.symbols.map(s => s.name), ["Red stick figure head"]);
  const red2 = prep(one("#e02424")[0], red.catalogs).out;
  assert.deepEqual(red2.catalogs.symbols.map(s => s.name), ["Red stick figure head"], "no \"Red stick figure head 2\"");
  const blue = prep(one("#2563eb")[0], red.catalogs).out;
  assert.deepEqual(blue.catalogs.symbols.map(s => s.name), ["Red stick figure head", "Blue stick figure head"]);
  const hollow = prep(one("#e02424", { headFilled: false })[0], red.catalogs).out;
  assert.deepEqual(hollow.catalogs.symbols.map(s => s.name), ["Red stick figure head", "Red stick figure head 2"], "a ring is a different shape");
  // A smaller figure's (filled) head reuses the big one's picture, placed so it shows its own size.
  const small = prep(one("#e2461c", {}, 120)[0], red.catalogs);
  assert.equal(small.out.catalogs.symbols.length, 1);
  const smallHead = small.built.frames[0][0], toSymbol = engineToSymbolStageV1(page.width, page.height)!;
  const big = buildScene(one("#e2461c")[0], 12).frames[0][0], bigOuter = 2 * big.headRadius + big.style.thickness;
  const bigPicture = Math.ceil((bigOuter + 4) * SYMBOL_PICTURE_PIXELS_PER_UNIT) / SYMBOL_PICTURE_PIXELS_PER_UNIT;
  const shown = small.out.placements[0][0].width * (bigOuter / bigPicture); // the head's width inside the placed picture
  close(shown, (2 * smallHead.headRadius + smallHead.style.thickness) * toSymbol.scale, 1e-9, "small head size");
});

test("the Effects (2C) test buttons: color head names, no near-duplicates (one Leaf, one Laser eye, no \"… 2\")", async () => {
  const { prepareEffectSymbolsV1 } = await import("./animatorSceneSymbolsV1.ts");
  const { sceneEffectLayers } = await import("../animator/toFrames.ts");
  const { effectsTestScenes, makeEffectsTestScene } = await import("../animator/moves/tests2c.ts");
  const { movingBackgroundLayers } = await import("../animator/effects/movingBackground.ts");
  const page = { width: 772, height: 626 }, stageWidth = visibleStageWidth(page.width, page.height);
  let catalogs: UnifiedProjectCatalogsV2 = { symbols: [], assets: [] };
  const made: Record<string, string[]> = {};
  const quiet = console.warn; console.warn = () => undefined;
  try {
    for (const entry of effectsTestScenes()) {
      if (!entry.plan || !["sisterTest", "teleport", "laserEyes", "elementalFight", "policeEscort", "parkour", "rainyWindyDay", "flicker"].includes(entry.id)) continue;
      // (the 10 s elemental fight as planned, not refitted to this page: the same figures and effects, much quicker)
      const scene = makeEffectsTestScene(entry.plan, entry.id === "elementalFight" ? undefined : stageWidth), built = buildScene(scene, 12);
      const centered = centerAnimation(built.frames, stageWidth, built.objects);
      const heads = prepareAnimatorSceneSymbolsV1(scene, centered.frames, centered.objects, page, catalogs, fakeCanvas)!;
      const layers = sceneEffectLayers(scene, built, centered.shift);
      const moving = layers.background ? movingBackgroundLayers(scene, built, centered.shift, layers.background) : null;
      if (moving) layers.background = moving.still;
      const fx = prepareEffectSymbolsV1(moving ? { ...layers, moving: moving.layers.map(layer => layer.pictures) } : layers, page, heads.catalogs, fakeCanvas);
      made[entry.id] = [...new Set([...heads.definitions.values(), ...(fx?.definitions.values() ?? [])].map(d => d.name))];
      catalogs = fx?.catalogs ?? heads.catalogs;
    }
  } finally { console.warn = quiet; }
  assert.deepEqual(made.sisterTest.slice(0, 2), ["Red stick figure head", "Blue stick figure head"]);
  assert.deepEqual(made.elementalFight.filter(n => n.includes("head")), ["Red stick figure head", "Blue stick figure head"], "not \"Red (laser)'s head\"");
  assert.deepEqual(made.elementalFight.filter(n => n.startsWith("Laser eye")), ["Laser eye"]);
  assert.deepEqual(made.policeEscort, ["Blue stick figure head", "Red stick figure head", "Handcuffs"], "not \"Officer's head\" / \"Red stick figure head 2\"");
  assert.deepEqual(made.rainyWindyDay, ["Black stick figure head", "Raindrop", "Leaf"], "not \"Hero's head\"; one Leaf");
  assert.deepEqual(made.flicker, ["Black stick figure head", "Light bulb"]);
  const names = catalogs.symbols.map(s => s.name);
  assert.ok(names.every(n => !/ \d+$/.test(n) && !n.includes("'s head")), names.join(" | "));
  assert.equal(new Set(names).size, names.length);
});

// A tiny real raster canvas for heads (circles: filled and/or outlined), with drawImage and getImageData, so the
// picture comparison runs on real pixels in Node. A "decoded" picture is { width, height, pixels }.
type TestPicture = { width: number; height: number; pixels: Uint8ClampedArray };
const rasterCanvas = () => {
  let data = new Uint8ClampedArray(0);
  const canvas = { width: 0, height: 0, getContext: () => ctx as unknown as CanvasRenderingContext2D,
    toDataURL: () => `data:image/png;base64,${Buffer.from(`${canvas.width}x${canvas.height}|${createHash("sha256").update(data).digest("hex")}`).toString("base64")}` };
  const ready = () => { if (data.length !== canvas.width * canvas.height * 4) data = new Uint8ClampedArray(canvas.width * canvas.height * 4); };
  let k = 1, ox = 0, oy = 0, circle = { x: 0, y: 0, r: 0 };
  const paint = (color: string, inner: number, outer: number) => {
    ready();
    const rgb = [1, 3, 5].map(i => Number.parseInt(color.slice(i, i + 2), 16));
    for (let y = 0; y < canvas.height; y += 1) for (let x = 0; x < canvas.width; x += 1) {
      const d = Math.hypot(x + 0.5 - (ox + circle.x * k), y + 0.5 - (oy + circle.y * k));
      if (d >= inner && d <= outer) data.set([...rgb, 255], (y * canvas.width + x) * 4);
    }
  };
  const ctx = {
    lineWidth: 1, fillStyle: "#000000", strokeStyle: "#000000", lineCap: "", lineJoin: "",
    save() { ready(); }, restore() {}, beginPath() {},
    setTransform(a: number, _b: number, _c: number, _d: number, e: number, f: number) { k = a; ox = e; oy = f; },
    arc(x: number, y: number, r: number) { circle = { x, y, r }; },
    fill() { paint(ctx.fillStyle, 0, circle.r * k); },
    stroke() { paint(ctx.strokeStyle, (circle.r - ctx.lineWidth / 2) * k, (circle.r + ctx.lineWidth / 2) * k); },
    drawImage(image: TestPicture) { data = new Uint8ClampedArray(image.pixels); },
    getImageData(_x: number, _y: number, width: number, height: number) { ready(); return { width, height, data }; },
  };
  return canvas;
};
// The picture of one head, as the app would decode it from the Library.
const headPictureOf = (color: string, headFilled = true, radius = 21): TestPicture => {
  const canvas = rasterCanvas(), size = Math.ceil((2 * radius + DEFAULT_STYLE.thickness + 4) * SYMBOL_PICTURE_PIXELS_PER_UNIT);
  canvas.width = size; canvas.height = size;
  const units = size / SYMBOL_PICTURE_PIXELS_PER_UNIT;
  drawHead(canvas.getContext() as never, { style: { ...DEFAULT_STYLE, color, headFilled }, headRadius: radius }, { x: units / 2, y: units / 2 }, { scale: SYMBOL_PICTURE_PIXELS_PER_UNIT, offsetX: 0, offsetY: 0 });
  return { width: size, height: size, pixels: new Uint8ClampedArray(canvas.getContext().getImageData(0, 0, size, size).data) };
};

test("after a reload (looks forgotten), a Library symbol is compared by its PICTURE: nearly the same is reused, really different is not", async () => {
  const { forgetMadeSymbolLooksV1, picturesLookAlikeV1 } = await import("./animatorSceneSymbolsV1.ts");
  const { addEngineLibrarySymbolV2 } = await import("./unifiedSymbolLibraryV2.ts");
  const px = (p: TestPicture) => ({ width: p.width, height: p.height, data: p.pixels });
  // The pictures themselves: two reds / two blues a shade apart, a bigger and a smaller head → alike;
  // red vs orange, blue vs purple, filled vs hollow → not.
  assert.equal(picturesLookAlikeV1(px(headPictureOf("#e02424")), px(headPictureOf("#e2461c"))).alike, true);
  assert.equal(picturesLookAlikeV1(px(headPictureOf("#2563eb")), px(headPictureOf("#2a6fdb"))).alike, true);
  const sizes = picturesLookAlikeV1(px(headPictureOf("#e02424", true, 8.4)), px(headPictureOf("#e02424")));
  assert.equal(sizes.alike, true);
  close(sizes.scale, (2 * 21 + 7) / (2 * 8.4 + 7), 0.1, "their head is that much bigger");
  assert.equal(picturesLookAlikeV1(px(headPictureOf("#e02424")), px(headPictureOf("#f97316"))).alike, false, "red vs orange");
  assert.equal(picturesLookAlikeV1(px(headPictureOf("#2563eb")), px(headPictureOf("#7c3aed"))).alike, false, "blue vs purple");
  assert.equal(picturesLookAlikeV1(px(headPictureOf("#e02424")), px(headPictureOf("#e02424", false))).alike, false, "filled vs hollow");

  // A project reopened after a reload: its Library already has the sister's-test heads (#e2461c red, #2a6fdb blue);
  // the elemental fight's figures are #e02424 and #2563eb.
  const page = { width: 772, height: 626 };
  const decoded = new Map<string, TestPicture>();
  const libraryWith = (entries: [string, TestPicture][]) => {
    let catalogs: UnifiedProjectCatalogsV2 = { symbols: [], assets: [] };
    for (const [name, picture] of entries) {
      const pngDataUrl = `data:image/png;base64,${Buffer.from(`${name}|${createHash("sha256").update(picture.pixels).digest("hex")}`).toString("base64")}`;
      const added = addEngineLibrarySymbolV2(catalogs, { name, pngDataUrl, width: 40, height: 40 });
      decoded.set(added.definition.definitionDigest, picture);
      catalogs = added.catalogs;
    }
    return catalogs;
  };
  const getImage = (definition: { definitionDigest: string }) => (decoded.get(definition.definitionDigest) ?? null) as unknown as CanvasImageSource;
  const fight = { id: "f", title: "f", durationSec: 1, groundY: 900, characters: [figure("red", "Red (laser)", "right", 700, "#e02424"), figure("blue", "Blue (ice)", "left", 1200, "#2563eb")] } as unknown as Scene;
  const built = buildScene(fight, 12);
  const opened = libraryWith([["Red stick figure head", headPictureOf("#e2461c")], ["Blue stick figure head", headPictureOf("#2a6fdb")]]);
  forgetMadeSymbolLooksV1();
  const out = prepareAnimatorSceneSymbolsV1(fight, built.frames, built.objects, page, opened, rasterCanvas, getImage)!;
  assert.deepEqual(out.catalogs.symbols.map(s => s.name), ["Red stick figure head", "Blue stick figure head"], "no \"Red/Blue stick figure head 2\"");
  assert.deepEqual([...out.definitions.values()].map(d => d.definitionId), opened.symbols.map(s => s.definitionId));
  // Placed at the head's own size.
  const toSymbol = engineToSymbolStageV1(page.width, page.height)!, head = built.frames[0][0];
  const theirs = headPictureOf("#e2461c"), outer = 2 * head.headRadius + head.style.thickness;
  close(out.placements[0][0].width * (49 / (theirs.width / SYMBOL_PICTURE_PIXELS_PER_UNIT)), outer * toSymbol.scale, 0.5, "head size");
  // Remembered: the next scene doesn't need the picture any more.
  assert.equal(prepareAnimatorSceneSymbolsV1(fight, built.frames, built.objects, page, opened, rasterCanvas)!.catalogs.symbols.length, 2);

  // Really different under the same name (an orange picture, or a hollow head, called "Red stick figure head") → its own.
  const red = { ...fight, characters: [fight.characters[0]] } as Scene;
  for (const other of [headPictureOf("#f97316"), headPictureOf("#e02424", false)]) {
    forgetMadeSymbolLooksV1();
    const library = libraryWith([["Red stick figure head", other]]);
    const made = prepareAnimatorSceneSymbolsV1(red, built.frames.map(f => [f[0]]), built.objects, page, library, rasterCanvas, getImage)!;
    assert.deepEqual(made.catalogs.symbols.map(s => s.name), ["Red stick figure head", "Red stick figure head 2"]);
  }
  // Without the app's pictures (no getImage) nothing is guessed: "… 2", as before.
  forgetMadeSymbolLooksV1();
  assert.equal(prepareAnimatorSceneSymbolsV1(fight, built.frames, built.objects, page, opened, rasterCanvas)!.catalogs.symbols.length, 4);
});
