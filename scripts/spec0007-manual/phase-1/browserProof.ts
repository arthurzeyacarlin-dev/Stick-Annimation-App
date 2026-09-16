import nativeAssert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { chromium, type Page } from "playwright-core";
import { BROWSER_MODES, BUILD_STAMP_PATH, EXPECTED_BROWSER_CASES, FIXTURE_PATH, assertClipboardEvidence, assertDestructiveEvidence, assertPlaybackEvidence, bind, currentSourceDigest, digest, type Binding, type BrowserRunMetrics, type ProducerResult } from "./proofContract.ts";

let assertionCount = 0;
type PlaybackPaintSource = { layerId: string; frameIndex: number; bitmapHash: string };
type PlaybackPaintPass = { at: number; visibleAtClear: boolean; draws: Array<{ source: PlaybackPaintSource | null; args: number[] }> };
type PlaybackPaintProbe = { sources: WeakMap<object, ImageData>; expected: Map<ImageData, PlaybackPaintSource>; passes: PlaybackPaintPass[]; armed: boolean; startedAt: number };
const assert: typeof nativeAssert = new Proxy(nativeAssert, { get(target, key) {
  const value = Reflect.get(target, key);
  return typeof value === "function" ? (...args: unknown[]) => { const result = value(...args); assertionCount++; return result; } : value;
} });

const url = process.argv.find(a => a.startsWith("--url="))?.slice(6) ?? "http://127.0.0.1:56875/";
assert.match(url, /^http:\/\/127\.0\.0\.1:(?!3000\/)[0-9]+\/$/);
const selectedModes = BROWSER_MODES.filter(mode => process.argv.includes(`--${mode}`));
assert.ok(selectedModes.length <= 1, "one browser mode per process");
const mode = selectedModes[0] ?? "flow";
const sourceDigestBefore = currentSourceDigest();
const output = `output/spec-0007/phase-1/browser/${process.argv.includes("--compact") ? "compact" : "desktop"}/${mode}`;
const producerSha256 = createHash("sha256").update(readFileSync("scripts/spec0007-manual/phase-1/browserProof.ts")).digest("hex");
mkdirSync(output, { recursive: true });
const requests: BrowserRunMetrics["requests"] = [], errors: string[] = [], operations: BrowserRunMetrics["operations"] = [];
const completedCases: ProducerResult["completedCases"] = [], screenshots: Binding[] = [], servedAssets = new Map<string, Binding>();
const responseReads: Promise<void>[] = [];
const sourceStoreWrites: unknown[] = [];
let lastCaseAssertion = assertionCount;
const recordCase = (operation: BrowserRunMetrics["operations"][number]) => {
  const assertions = assertionCount - lastCaseAssertion;
  assert.ok(assertions > 0, `${operation.id}: real assertions required before completion`);
  operation.completed = true; operation.assertions = assertions;
  let evidenceIndex = operations.indexOf(operation);
  if (evidenceIndex < 0) { evidenceIndex = operations.length; operations.push(operation); }
  completedCases.push({ id: operation.id, assertions, evidenceIndex }); lastCaseAssertion = assertionCount;
};
const capture = async (page: Page, path: string) => { await page.screenshot({ path, fullPage: true }); screenshots.push(bind(path)); };
const consoleMessages: Array<{ type: string; text: string }> = [];
let activePage: Page | null = null;
let expectedSaveAsName: string | null = null;
let expectedAlert: RegExp | null = null;
let expectedConfirmation: { message: string; accept: boolean } | null = null;
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true,
  args: ["--disable-background-networking", "--disable-component-update", "--disable-sync", "--disable-extensions", "--no-first-run", "--enable-precise-memory-info", "--js-flags=--expose-gc"] });
const settle = (page: Page) => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
const storeSnapshot = (page: Page) => page.evaluate(async () => {
  const database = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("diamond-animation-unified-v2"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  const names = ["heads", "versions", "assets", "assetMetadata", "projects"];
  const transaction = database.transaction(names, "readonly");
  const values = await Promise.all(names.map(name => new Promise<unknown[]>((resolve, reject) => { const request = transaction.objectStore(name).getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); })));
  database.close();
  const normalize = async (value: unknown): Promise<unknown> => {
    if (ArrayBuffer.isView(value)) return { byteLength: value.byteLength, sha256: [...new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice()))].map(v => v.toString(16).padStart(2, "0")).join("") };
    if (value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) return Promise.all(value.map(normalize));
    return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([key, item]) => [key, await normalize(item)])));
  };
  return Object.fromEntries(await Promise.all(names.map(async (name, i) => [name, await normalize(values[i])]))) as Record<string, Array<Record<string, unknown>>>;
});
const snapshot = (page: Page, outsideRect: number[] | null = null) => page.evaluate(async outsideRect => {
  const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-workspace-canvas="editable"]')!;
  const root = window as unknown as { __phase1: { coverage: WeakMap<object, unknown> } };
  const hash = async (bytes: Uint8Array | Uint8ClampedArray) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource))].map(b => b.toString(16).padStart(2, "0")).join("");
  const normalize = async (value: unknown): Promise<unknown> => {
    if (value === null || typeof value !== "object") return value;
    if (ArrayBuffer.isView(value)) return { bytes: value.byteLength, sha256: await hash(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) };
    if (Array.isArray(value)) return Promise.all(value.map(normalize));
    if (value instanceof ImageData) return { width: value.width, height: value.height, pixels: await hash(value.data), coverage: await normalize(root.__phase1.coverage.get(value) ?? null) };
    return Object.fromEntries(await Promise.all(Object.entries(value).filter(([key]) => !["previewUrl", "tweenEndPreviewUrl"].includes(key)).map(async ([key, item]) => [key, await normalize(item)])));
  };
  const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
  let maximumAlpha = 0, count = 0;
  const centeredPixels: number[][] = [];
  for (let i = 3; i < data.length; i += 4) {
    maximumAlpha = Math.max(maximumAlpha, data[i]);
    if (data[i]) { count++; const pixel = (i - 3) / 4; centeredPixels.push([pixel % canvas.width - Math.floor(canvas.width / 2), Math.floor(pixel / canvas.width) - Math.floor(canvas.height / 2), ...data.slice(i - 3, i + 1)]); }
  }
  type Fiber = { return: Fiber | null; memoizedProps?: { authoringContextKey?: string }; memoizedState?: { memoizedState: unknown; next: Fiber["memoizedState"] } };
  let fiber = (canvas as unknown as Record<string, Fiber>)[Object.keys(canvas).find(k => k.startsWith("__reactFiber$"))!];
  type Draft = { writer: { get(x: number, y: number): unknown }; dirty: { left: number; top: number; width: number; height: number }; engine: unknown };
  let layers: unknown = null, globalHistoryLength = -1, localHistoryLength = 0, draft: Draft | null = null;
  let globalHistoryPosition = 0, localHistoryPosition = 0;
  type AuthoringMetrics = { worldWidth: number; worldHeight: number; scaleX: number; scaleY: number; canvasWidth: number; canvasHeight: number };
  let authoringMetrics: AuthoringMetrics | null = null;
  const protectedRefs: unknown[] = [];
  let authoringContext = "";
  while (fiber) {
    if (fiber.memoizedProps?.authoringContextKey) authoringContext = fiber.memoizedProps.authoringContextKey;
    let hook = fiber.memoizedState;
    while (hook) {
      const state = hook.memoizedState as { current?: unknown } | null;
      const value = state && typeof state === "object" && "current" in state ? state.current : null;
      if (layers === null && Array.isArray(value) && value[0]?.timelineFrames) layers = value;
      if (Array.isArray(value) && value[0]?.owner && value[0]?.layers) {
        globalHistoryLength = value.length;
        const next = hook.next?.memoizedState as { current?: number } | undefined;
        if (typeof next?.current === "number") globalHistoryPosition = next.current + 1;
      }
      if (value instanceof Map && value.size > 0 && [...value.values()].every(v => v && Array.isArray(v.entries) && typeof v.position === "number")) {
        localHistoryLength = [...value.values()].reduce((sum, stack) => sum + stack.entries.length, 0);
        localHistoryPosition = [...value.values()].reduce((sum, stack) => sum + stack.position + 1, 0);
      }
      if (value && typeof value === "object" && "engine" in value && "writer" in value) draft = value as Draft;
      if (value && typeof value === "object" && "worldWidth" in value && "worldHeight" in value && "scaleX" in value && "canvasWidth" in value) authoringMetrics = value as AuthoringMetrics;
      // Onion and clipboard references borrow authored rig data. These transient
      // references must not enter the document hash or its save/open comparison.
      if (value && typeof value === "object" && !(value instanceof Map) && !Array.isArray(value) &&
        !("previousBitmap" in value && "nextBitmap" in value && "previousTextObjects" in value && "nextTextObjects" in value) &&
        !("sourceLayerId" in value && "snapshot" in value && "stickContent" in value && "symbolInstances" in value)) {
        const entries = Object.values(value);
        if ("symbols" in value && "assets" in value || entries.some(item => item && typeof item === "object" && "structureGraph" in item) ||
            entries.some(item => Array.isArray(item) && item.some(v => v?.definitionId && v?.itemId))) protectedRefs.push(value);
      }
      hook = hook.next;
    }
    fiber = fiber.return!;
  }
  const normalizedLayers = await normalize(layers), normalizedProtected = await normalize(protectedRefs);
  const layerList = layers as Array<{ id: string; timelineFrames: Array<{ bitmap: ImageData | null; textObjects?: unknown[] }> }>;
  const uniqueProtected = [...new Set(protectedRefs)] as Array<Record<string, unknown>>;
  const catalogs = uniqueProtected.find(value => "symbols" in value && "assets" in value);
  const symbols = (catalogs?.symbols ?? []) as Array<{ structuredPayload?: unknown }>;
  const inventory = {
    layers: layerList?.length ?? 0, framesPerLayer: layerList?.map(layer => layer.timelineFrames.length) ?? [],
    rasterCells: layerList?.flatMap(layer => layer.timelineFrames).filter(frame => frame.bitmap).length ?? 0,
    textObjects: layerList?.flatMap(layer => layer.timelineFrames).reduce((sum, frame) => sum + (frame.textObjects?.length ?? 0), 0) ?? 0,
    definitions: symbols.length, mixedDefinitions: symbols.filter(symbol => symbol.structuredPayload).length,
    rigCells: uniqueProtected.flatMap(value => Object.values(value)).filter(value => value && typeof value === "object" && "structureGraph" in value).length,
    instances: uniqueProtected.flatMap(value => Object.values(value)).filter(Array.isArray).flat().filter(value => value?.definitionId && value?.itemId).length,
  };
  type WireCoverage = { tiles: Array<{ x: number; y: number; palette: unknown[]; runs: Uint8Array }> };
  const coveragePixels = new Map<number, unknown>();
  for (const tile of (root.__phase1.coverage.get(canvas) as WireCoverage | null)?.tiles ?? []) {
    const bytes = tile.runs, u16 = (offset: number) => bytes[offset] | bytes[offset + 1] << 8;
    for (let offset = 0; offset < bytes.length; offset += 14) {
      const start = u16(offset), count = u16(offset + 2);
      const entry = tile.palette[u16(offset + 4)] as { variant: string; color: string; opacityByte: number; owners?: string[] };
      const pixel = { key: { variant: entry.variant, color: entry.color, opacityByte: entry.opacityByte }, base: Array.from(bytes.slice(offset + 6, offset + 10)), coverage: bytes[offset + 10], pigment: Array.from(bytes.slice(offset + 11, offset + 14)), ...(entry.owners ? { owners: entry.owners } : {}) };
      for (let i = start; i < start + count; i++) coveragePixels.set((tile.y + Math.floor(i / 32)) * canvas.width + tile.x + i % 32, pixel);
    }
  }
  if (draft?.dirty) {
    const { left, top, width, height } = draft.dirty;
    for (let y = top; y < top + height; y++) for (let x = left; x < left + width; x++) {
      const pixel = draft.writer.get(x, y), index = y * canvas.width + x;
      if (pixel) coveragePixels.set(index, pixel); else coveragePixels.delete(index);
    }
  }
  let outsideRaster = null;
  if (outsideRect) {
    const separator = authoringContext.lastIndexOf(":"), layerId = authoringContext.slice(0, separator), frameIndex = Number(authoringContext.slice(separator + 1));
    const bitmap = layerList.find(layer => layer.id === layerId)!.timelineFrames[frameIndex].bitmap;
    const svg = document.querySelector<SVGGraphicsElement>('svg[aria-label="Editable stick figure content"]')!, bounds = canvas.getBoundingClientRect();
    const center = (x: number, y: number) => {
      const p = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM()!);
      return [(p.x - bounds.left) * canvas.width / bounds.width - Math.floor(canvas.width / 2), (p.y - bounds.top) * canvas.height / bounds.height - Math.floor(canvas.height / 2)];
    };
    const a = center(outsideRect[0], outsideRect[1]), b = center(outsideRect[2], outsideRect[3]);
    const padding = outsideRect[0] === 790 ? 16 : 2;
    let rect = [Math.floor(a[0]) - padding, Math.floor(a[1]) - padding, Math.ceil(b[0]) + padding, Math.ceil(b[1]) + padding];
    let eraser = null;
    if (outsideRect[0] === 900) {
      if (!authoringMetrics || authoringMetrics.canvasWidth !== canvas.width || authoringMetrics.canvasHeight !== canvas.height) throw new Error("missing current eraser authoring metrics");
      const { scaleX, scaleY, worldWidth, worldHeight } = authoringMetrics;
      // Eraser size uses drawing-world units; the SVG authoring stage has a
      // separate fit scale. Include its half-pixel AA and .001 canonical rounding.
      const radius = 6 + .5 / Math.max(scaleX, scaleY) + .001;
      rect = [Math.floor(Math.min(a[0], b[0]) - radius * scaleX), Math.floor(Math.min(a[1], b[1]) - radius * scaleY), Math.ceil(Math.max(a[0], b[0]) + radius * scaleX), Math.ceil(Math.max(a[1], b[1]) + radius * scaleY)].map(value => value === 0 ? 0 : value);
      eraser = { size: 12, pixelPath: [a, b], scaleX, scaleY, worldWidth, worldHeight, canvasWidth: canvas.width, canvasHeight: canvas.height };
    }
    const outside = (x: number, y: number) => x < rect[0] || y < rect[1] || x >= rect[2] || y >= rect[3];
    const pixels: number[][] = [], provenance: unknown[] = [];
    if (bitmap) {
      for (let y = 0; y < bitmap.height; y++) for (let x = 0; x < bitmap.width; x++) {
        const cx = x - Math.floor(bitmap.width / 2), cy = y - Math.floor(bitmap.height / 2), i = (y * bitmap.width + x) * 4;
        if (outside(cx, cy) && bitmap.data.subarray(i, i + 4).some(value => value !== 0)) pixels.push([cx, cy, ...bitmap.data.subarray(i, i + 4)]);
      }
      for (const tile of (root.__phase1.coverage.get(bitmap) as WireCoverage | null)?.tiles ?? []) {
        const bytes = tile.runs, u16 = (offset: number) => bytes[offset] | bytes[offset + 1] << 8;
        for (let offset = 0; offset < bytes.length; offset += 14) {
          const start = u16(offset), count = u16(offset + 2);
          for (let i = start; i < start + count; i++) {
            const x = tile.x + i % 32 - Math.floor(bitmap.width / 2), y = tile.y + Math.floor(i / 32) - Math.floor(bitmap.height / 2);
            if (outside(x, y)) provenance.push([x, y, tile.palette[u16(offset + 4)], ...bytes.slice(offset + 6, offset + 14)]);
          }
        }
      }
    }
    provenance.sort((a, b) => (a as number[])[1] - (b as number[])[1] || (a as number[])[0] - (b as number[])[0]);
    outsideRaster = { authorRect: outsideRect, rect, eraser, pixels: await hash(new TextEncoder().encode(JSON.stringify(pixels))), coverage: await hash(new TextEncoder().encode(JSON.stringify(provenance))), pixelCount: pixels.length, coverageCount: provenance.length };
  }
  return { pixels: await hash(data), maximumAlpha, count, historyLength: globalHistoryLength + localHistoryLength, globalHistoryLength, localHistoryLength,
    historyPosition: globalHistoryPosition + localHistoryPosition,
    authored: await hash(new TextEncoder().encode(JSON.stringify([normalizedLayers, normalizedProtected]))),
    protected: await hash(new TextEncoder().encode(JSON.stringify(normalizedProtected))),
    coverage: await normalize(root.__phase1.coverage.get(canvas) ?? null), coveragePixels: await hash(new TextEncoder().encode(JSON.stringify([...coveragePixels].sort(([a], [b]) => a - b)))),
    centeredPixels: await hash(new TextEncoder().encode(JSON.stringify(centeredPixels))),
    centeredCoveragePixels: await hash(new TextEncoder().encode(JSON.stringify([...coveragePixels].sort(([a], [b]) => a - b).map(([i, value]) => [i % canvas.width - Math.floor(canvas.width / 2), Math.floor(i / canvas.width) - Math.floor(canvas.height / 2), value])))),
    width: canvas.width, height: canvas.height, authoringContext, inventory, normalizedLayers, normalizedProtected, outsideRaster };
}, outsideRect);

const run = async () => {
  const profile = process.argv.includes("--compact") ? { width: 390, height: 844, deviceScaleFactor: 2 } : { width: 1440, height: 900, deviceScaleFactor: 1 };
  const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height }, deviceScaleFactor: profile.deviceScaleFactor });
  context.on("page", target => {
    target.on("pageerror", error => errors.push(error.message));
    target.on("console", message => {
      if (message.type() === "error" || message.type() === "warning" || message.text().startsWith("Phase 1")) consoleMessages.push({ type: message.type(), text: message.text() });
    });
    target.on("dialog", async dialog => {
      if (dialog.type() === "confirm" && expectedConfirmation?.message === dialog.message()) {
        const { accept } = expectedConfirmation; expectedConfirmation = null;
        if (accept) await dialog.accept(); else await dialog.dismiss(); return;
      }
      if (dialog.type() === "alert" && expectedAlert?.test(dialog.message())) { operations.push({ id: "expected-failure-notice", text: dialog.message() }); expectedAlert = null; await dialog.accept(); return; }
      if (dialog.type() === "prompt" && dialog.message() === "Save project as" && expectedSaveAsName) { await dialog.accept(expectedSaveAsName); expectedSaveAsName = null; return; }
      errors.push(`dialog:${dialog.message()}`); await dialog.dismiss();
    });
  });
  await context.exposeBinding("phase1SourceWrite", (_source, write: unknown) => { sourceStoreWrites.push(write); });
  context.on("response", response => {
    const parsed = new URL(response.url());
    if (parsed.origin !== new URL(url).origin || !parsed.pathname.startsWith("/_next/static/")) return;
    responseReads.push((async () => {
      const bytes = await response.body(), path = `.next/static/${decodeURIComponent(parsed.pathname.slice("/_next/static/".length))}`;
      servedAssets.set(path, { path, bytes: bytes.length, sha256: digest(bytes) });
    })().catch(error => { errors.push(`served-asset:${String(error)}`); }));
  });
  await context.route("**/*", async route => {
    const request = route.request(), parsed = new URL(request.url()), origin = new URL(url).origin;
    const mock = parsed.origin === origin && parsed.pathname === "/api/ai" && request.method() === "GET";
    const favicon = parsed.origin === origin && parsed.pathname === "/favicon.ico";
    const allowed = parsed.origin === origin && !parsed.pathname.startsWith("/api/");
    requests.push({ method: request.method(), url: parsed.origin + parsed.pathname, disposition: mock ? "mock-api" : favicon ? "mock-favicon" : allowed ? "loopback" : "blocked" });
    if (mock) await route.fulfill({ status: 200, contentType: "application/json", body: '{"available":false,"reason":"phase1-proof"}' });
    else if (favicon) await route.fulfill({ status: 204, body: "" });
    else if (allowed) await route.continue(); else await route.abort();
  });
  await context.addInitScript(recordPlayback => {
    // Initial about:blank documents have no storage origin. Install observers
    // only when the actual loopback app document is being initialized.
    if (location.hostname !== "127.0.0.1") return;
    localStorage.setItem("da_welcome_seen", "1");
    const coverage = new WeakMap<object, unknown>(), original = WeakMap.prototype.set;
    WeakMap.prototype.set = function(key, value) {
      // Do not inspect arbitrary getters/proxies such as Next searchParams.
      if (value === null || value && typeof value === "object" &&
        Object.getOwnPropertyDescriptor(value, "tileSize")?.value === 32 &&
        [1, 2].includes(Object.getOwnPropertyDescriptor(value, "version")?.value)) original.call(coverage, key, value);
      return original.call(this, key, value);
    };
    const playback: PlaybackPaintProbe = { sources: new WeakMap(), expected: new Map(), passes: [], armed: false, startedAt: 0 };
    if (recordPlayback) {
      const put = CanvasRenderingContext2D.prototype.putImageData;
      CanvasRenderingContext2D.prototype.putImageData = function(image: ImageData, ...args: number[]) {
        Reflect.apply(put, this, [image, ...args]); playback.sources.set(this.canvas, image);
      };
      const clear = CanvasRenderingContext2D.prototype.clearRect;
      CanvasRenderingContext2D.prototype.clearRect = function(...args: [number, number, number, number]) {
        Reflect.apply(clear, this, args);
        if (playback.armed && this.canvas instanceof HTMLCanvasElement && this.canvas.dataset.workspaceCanvas === "playback") {
          playback.passes.push({ at: performance.now() - playback.startedAt, visibleAtClear: getComputedStyle(this.canvas).opacity === "1", draws: [] });
        }
      };
      const draw = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function(image: CanvasImageSource, ...args: number[]) {
        Reflect.apply(draw, this, [image, ...args]);
        if (playback.armed && this.canvas instanceof HTMLCanvasElement && this.canvas.dataset.workspaceCanvas === "playback") {
          const pass = playback.passes.at(-1); if (!pass) throw new Error("playback draw without a cleared render pass");
          const bitmap = playback.sources.get(image);
          pass.draws.push({ source: bitmap ? playback.expected.get(bitmap) ?? null : null, args });
        }
      };
    }
    (window as unknown as { __phase1: unknown }).__phase1 = { coverage, playback };
    const sourceKeys = new Set(["da_saved_drawing_projects", "da_saved_stick_projects_v1", "da_saved_unified_projects_v1"]);
    for (const method of ["setItem", "removeItem", "clear"] as const) {
      const original = Storage.prototype[method];
      Object.defineProperty(Storage.prototype, method, { configurable: true, writable: true, value: function(this: Storage, ...args: unknown[]) {
        if (this === localStorage && (method === "clear" || sourceKeys.has(String(args[0])))) void (window as unknown as { phase1SourceWrite: (value: unknown) => Promise<void> }).phase1SourceWrite({ storage: "localStorage", method, key: args[0] ?? null });
        return Reflect.apply(original, this, args);
      } });
    }
    for (const name of ["put", "add", "delete", "clear"] as const) {
      const original = IDBObjectStore.prototype[name];
      Object.defineProperty(IDBObjectStore.prototype, name, { configurable: true, writable: true, value: function(this: IDBObjectStore, ...args: unknown[]) {
        if (this.transaction.db.name !== "diamond-animation-unified-v2" || this.name === "projects") {
          void (window as unknown as { phase1SourceWrite: (value: unknown) => Promise<void> }).phase1SourceWrite({ database: this.transaction.db.name, store: this.name, method: name });
        }
        return Reflect.apply(original, this, args);
      } });
    }
  }, mode === "retention");
  const page = await context.newPage();
  activePage = page;
  await page.goto(url); await page.getByRole("button", { name: /^New Project/ }).click(); await settle(page);
  const button = (name: string) => page.getByRole("button", { name, exact: true });
  await button("Brush").click(); await button("Brush").scrollIntoViewIfNeeded(); await settle(page);
  const point = (x: number, y: number) => page.locator('svg[aria-label="Editable stick figure content"]').evaluate((svg, p) => {
    const q = new DOMPoint(p.x, p.y).matrixTransform((svg as SVGGraphicsElement).getScreenCTM()!); return { x: q.x, y: q.y };
  }, { x, y });
  const stroke = async (from: [number, number], to: [number, number]) => {
    const a = await point(...from), b = await point(...to);
    await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 16 });
    const preview = await snapshot(page); await page.mouse.up(); await settle(page);
    return { preview, after: await snapshot(page) };
  };
  const setRange = async (name: RegExp, value: number) => {
    const input = page.getByLabel(name);
    await input.evaluate((element, next) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, String(next));
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
    await settle(page); assert.equal(await input.inputValue(), String(value));
  };
  const variant = async (name: string) => {
    await button("Brush").click(); await button("Properties").click(); await page.getByRole("button", { name: /^Brush Tools:/ }).click();
    await page.getByRole("button", { name, exact: true }).filter({ hasText: new RegExp(`^${name}$`) }).click();
    await page.getByRole("button", { name: `Brush Tools: ${name}`, exact: true }).waitFor(); await settle(page);
  };
  const inspectKnife = (opacityByte: number, rememberOrigin = false, wholeStroke = false, refreshBackdrop = false) => page.evaluate(async ({ opacityByte, rememberOrigin, wholeStroke, refreshBackdrop }) => {
    const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-workspace-canvas="editable"]')!;
    type Wire = { tiles: Array<{ x: number; y: number; runs: Uint8Array }> };
    const weak = (window as unknown as { __phase1: { coverage: WeakMap<object, Wire | null> } }).__phase1.coverage;
    const hash = async (bytes: Uint8Array | Uint8ClampedArray) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource))].map(v => v.toString(16).padStart(2, "0")).join("");
    const pixels = async (surface: HTMLCanvasElement) => {
      const data = surface.getContext("2d")!.getImageData(0, 0, surface.width, surface.height).data;
      let painted = 0, wrongOpacity = 0, wrongColor = 0, mismatch = 0, coverageCount = 0;
      const seen = new Set<number>();
      for (let i = 3; i < data.length; i += 4) if (data[i]) { painted++; if (data[i] !== opacityByte) wrongOpacity++; if (data[i - 3] !== 255 || data[i - 2] !== 0 || data[i - 1] !== 0) wrongColor++; }
      const companion = weak.get(surface) ?? null;
      for (const tile of companion?.tiles ?? []) {
        const r = tile.runs, u16 = (o: number) => r[o] | r[o + 1] << 8;
        for (let o = 0; o < r.length; o += 14) for (let p = u16(o); p < u16(o) + u16(o + 2); p++) {
          const index = (tile.y + Math.floor(p / 32)) * surface.width + tile.x + p % 32, i = index * 4;
          const alpha = r[o + 10] / 255, baseAlpha = r[o + 9] / 255, outAlpha = alpha + baseAlpha * (1 - alpha);
          const expected = [0, 1, 2].map(c => Math.round((r[o + 11 + c] * alpha + r[o + 6 + c] * baseAlpha * (1 - alpha)) / outAlpha));
          expected.push(Math.round(outAlpha * 255)); coverageCount++; seen.add(index);
          if (expected.some((v, c) => v !== data[i + c])) mismatch++;
        }
      }
      for (let i = 3; i < data.length; i += 4) if (data[i] && !seen.has((i - 3) / 4)) mismatch++;
      return { painted, wrongOpacity, wrongColor, mismatch, coverageCount, pixelHash: await hash(data), coverageHash: await hash(new TextEncoder().encode(JSON.stringify(companion))) };
    };
    type Item = { id: string; x: number; y: number; width: number; height: number; sourceCanvas: HTMLCanvasElement };
    type Fiber = { return: Fiber | null; memoizedState: { memoizedState: { current?: unknown }; next: Fiber["memoizedState"] } | null };
    let fiber = (canvas as unknown as Record<string, Fiber>)[Object.keys(canvas).find(k => k.startsWith("__reactFiber$"))!];
    let session: { owner: string; items: Item[] } | null = null;
    while (fiber) { let hook = fiber.memoizedState; while (hook) { const value = hook.memoizedState?.current as Record<string, unknown> | undefined;
      if (value?.owner === "knife" && value.items) session = value as unknown as { owner: string; items: Item[] };
      hook = hook.next;
    } fiber = fiber.return!; }
    const current = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    const probe = window as unknown as { __knifeOrigin?: { bytes: Uint8ClampedArray; target: Set<number>; detachedPixels: number; wholeStroke: boolean } };
    if (rememberOrigin) {
      const seen = new Set<number>(); let target = new Set<number>();
      for (let p = 0; p < current.length / 4; p++) if (current[p * 4 + 3] && !seen.has(p)) {
        const queue = [p]; seen.add(p);
        for (let i = 0; i < queue.length; i++) { const q = queue[i], x = q % canvas.width;
          for (const next of [x ? q - 1 : -1, x + 1 < canvas.width ? q + 1 : -1, q - canvas.width, q + canvas.width]) if (next >= 0 && next < current.length / 4 && current[next * 4 + 3] && !seen.has(next)) { seen.add(next); queue.push(next); }
        }
        if (queue.length > target.size) target = new Set(queue);
      }
      const detachedPixels = seen.size - target.size;
      if (wholeStroke) target = seen;
      probe.__knifeOrigin = { bytes: current.slice(), target, detachedPixels, wholeStroke };
    }
    if (refreshBackdrop && probe.__knifeOrigin) probe.__knifeOrigin.bytes = current.slice();
    let originGhostPixels = 0, untouchedChanges = 0, unrelatedPainted = 0;
    if (probe.__knifeOrigin) for (let p = 0; p < current.length / 4; p++) {
      if (probe.__knifeOrigin.target.has(p)) { if (current[p * 4 + 3]) originGhostPixels++; }
      else { if (current[p * 4 + 3]) unrelatedPainted++; if ([0, 1, 2, 3].some(c => current[p * 4 + c] !== probe.__knifeOrigin!.bytes[p * 4 + c])) untouchedChanges++; }
    }
    const displayed = (window as unknown as { __codexBitmapSelectionDebug?: { items: Array<{ id: string; clientDisplayRect: { x: number; y: number; width: number; height: number } }> } }).__codexBitmapSelectionDebug;
    return { canvas: await pixels(canvas), originGhostPixels, untouchedChanges, unrelatedPainted, targetPixelCount: probe.__knifeOrigin?.target.size ?? 0, detachedPixels: probe.__knifeOrigin?.detachedPixels ?? 0, wholeStroke: probe.__knifeOrigin?.wholeStroke ?? false, items: await Promise.all((session?.items ?? []).map(async item => {
      const rect = displayed?.items.find(value => value.id === item.id)?.clientDisplayRect;
      if (!rect) throw new Error(`missing displayed Knife bounds:${item.id}`);
      return { id: item.id, x: item.x, y: item.y, width: item.width, height: item.height, pixels: await pixels(item.sourceCanvas), screen: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } };
    })) };
  }, { opacityByte, rememberOrigin, wholeStroke, refreshBackdrop });
  const onionPixels = () => page.locator('canvas[data-workspace-canvas="onion"]').evaluate(element => {
    const canvas = element as HTMLCanvasElement, data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    const histogram: Record<string, number> = {};
    for (let i = 0; i < data.length; i += 4) if (data[i + 3]) { const key = Array.from(data.slice(i, i + 4)).join(","); histogram[key] = (histogram[key] ?? 0) + 1; }
    return histogram;
  });
  const canonicalOnion = { previous: "91,64,159,148", next: "45,121,91,143" };
  const checkOnion = async (directions: Array<"previous" | "next">) => {
    await settle(page); const histogram = await onionPixels();
    assert.deepEqual(Object.keys(histogram).sort(), directions.map(direction => canonicalOnion[direction]).sort());
    for (const count of Object.values(histogram)) assert.ok(count > 0);
    return histogram;
  };
  const proveOnionMask = async () => {
    const before = await snapshot(page);
    const masks = await page.evaluate(async () => {
      const canvas = document.querySelector('canvas[data-workspace-canvas="editable"]')!;
      type Handle = { setOnionOverlayContent: (content: Record<string, unknown>) => void };
      type Fiber = { return: Fiber | null; memoizedState: { memoizedState: { current?: unknown }; next: Fiber["memoizedState"] } | null };
      let fiber = (canvas as unknown as Record<string, Fiber>)[Object.keys(canvas).find(key => key.startsWith("__reactFiber$"))!], handle: Handle | null = null;
      while (fiber) { let hook = fiber.memoizedState; while (hook) { const value = hook.memoizedState?.current as Partial<Handle> | undefined; if (typeof value?.setOnionOverlayContent === "function") handle = value as Handle; hook = hook.next; } fiber = fiber.return!; }
      if (!handle) throw new Error("missing mounted onion renderer");
      const empty = { previousBitmap: null, nextBitmap: null, previousTextObjects: [], nextTextObjects: [], previousStickContent: null, nextStickContent: null, previousSymbolInstances: [], nextSymbolInstances: [] };
      const tick = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const histogram = () => { const surface = document.querySelector<HTMLCanvasElement>('canvas[data-workspace-canvas="onion"]')!, bytes = surface.getContext("2d")!.getImageData(0, 0, surface.width, surface.height).data, result: Record<string, number> = {}; for (let i = 0; i < bytes.length; i += 4) if (bytes[i + 3]) { const key = Array.from(bytes.slice(i, i + 4)).join(","); result[key] = (result[key] ?? 0) + 1; } return result; };
      const expected: Record<string, string> = {};
      for (const [direction, fill] of [["previous", "rgba(92,63,158,0.58)"], ["next", "rgba(44,122,91,0.56)"]]) { const sample = document.createElement("canvas"); sample.width = sample.height = 1; const ctx = sample.getContext("2d")!; ctx.fillStyle = fill; ctx.fillRect(0, 0, 1, 1); expected[direction] = Array.from(ctx.getImageData(0, 0, 1, 1).data).join(","); }
      const directions = [];
      for (const direction of ["previous", "next"]) {
        const bitmap = new ImageData(1020, 1); let p = 0;
        for (const rgb of [[255, 0, 0], [0, 255, 255], [255, 0, 255], [0, 0, 255]]) for (let alpha = 1; alpha <= 255; alpha++) bitmap.data.set([...rgb, alpha], p++ * 4);
        const original = Array.from(bitmap.data);
        handle.setOnionOverlayContent({ ...empty, [direction + "Bitmap"]: bitmap }); await tick(); const raster = histogram();
        const rig = { figures: [], structureGraph: { joints: [{ id: "a", x: 800, y: 300 }, { id: "b", x: 1100, y: 600 }], limbs: [{ id: "l", startJointId: "a", endJointId: "b" }], activeJointId: "b" } };
        handle.setOnionOverlayContent({ ...empty, [direction + "StickContent"]: rig }); await tick();
        directions.push({ direction, raster, rig: histogram(), sourceSamples: p, sourceUnchanged: JSON.stringify(original) === JSON.stringify(Array.from(bitmap.data)) });
      }
      const overlap = new ImageData(10, 10); for (let i = 0; i < overlap.data.length; i += 4) overlap.data.set([255, 0, 255, 26], i);
      handle.setOnionOverlayContent({ ...empty, previousBitmap: overlap, nextBitmap: overlap }); await tick(); const overlapping = histogram();
      handle.setOnionOverlayContent(empty); await tick(); return { expected, directions, overlapping, off: histogram() };
    });
    assert.deepEqual(masks.expected, canonicalOnion);
    for (const value of masks.directions) { const color = canonicalOnion[value.direction as keyof typeof canonicalOnion]; assert.deepEqual(value.raster, { [color]: 1020 }); assert.deepEqual(Object.keys(value.rig), [color]); assert.ok(value.rig[color] > 0); assert.equal(value.sourceSamples, 1020); assert.equal(value.sourceUnchanged, true); }
    assert.deepEqual(masks.overlapping, { [canonicalOnion.next]: 100 }); assert.deepEqual(masks.off, {});
    const after = await snapshot(page); assert.equal(after.authored, before.authored); assert.equal(after.centeredPixels, before.centeredPixels);
    recordCase({ id: "onion-canonical-mask", before, after, ...masks });
  };
  const proveOnionLifecycle = async (layers: string[], frame: (layer: string, index: number) => ReturnType<Page["locator"]>) => {
    const variants = ["Brush", "Pencil", "Sketch", "Pixelate", "Glow"], colors = ["#ff0000", "#00ffff", "#ff00ff", "#0000ff", "#ffff00"], transparencies = [0, 50, 90, 75, 10];
    const authoredSources = [];
    for (const layer of layers) for (const index of [0, 2]) {
      await frame(layer, index).click(); await settle(page);
      for (let i = 0; i < variants.length; i++) {
        await variant(variants[i]); await setRange(/size:/, 24); await setRange(/^Transparency:/, transparencies[i]);
        await page.locator('input[type="color"]').first().fill(colors[i]); await settle(page);
        const before = await snapshot(page); await stroke([550 + i * 140, index ? 950 : 100], [600 + i * 140, index ? 950 : 100]); const after = await snapshot(page);
        assert.notEqual(after.authored, before.authored); authoredSources.push({ layer, index, variant: variants[i], color: colors[i], transparency: transparencies[i], before: before.authored, after: after.authored });
      }
    }
    await frame(layers[0], 1).click(); await settle(page); const before = await snapshot(page), views = [];
    await button("Onion").click();
    for (const layer of layers) for (const index of [1, 0, 2, 1]) {
      await frame(layer, index).click(); const directions = index === 0 ? ["next"] as const : index === 2 ? ["previous"] as const : ["previous", "next"] as const;
      const histogram = await checkOnion([...directions]), state = await snapshot(page); assert.equal(state.authored, before.authored); views.push({ layer, index, histogram, authored: state.authored });
    }
    await frame(layers[0], 1).click(); const enabled = await checkOnion(["previous", "next"]);
    await capture(page, `${output}/onion-canonical-enabled.png`);
    await button("Onion").click(); const off = await checkOnion([]); const offSnapshot = await snapshot(page); assert.equal(offSnapshot.authored, before.authored);
    await capture(page, `${output}/onion-canonical-disabled.png`);
    await button("Onion").click(); const restored = await checkOnion(["previous", "next"]); assert.deepEqual(restored, enabled);
    await variant("Sketch"); await stroke([720, 450], [860, 480]); const edited = await snapshot(page); assert.notEqual(edited.authored, before.authored);
    await button("Undo").click(); await settle(page); const undone = await snapshot(page); assert.equal(undone.authored, before.authored); const afterUndo = await checkOnion(["previous", "next"]); assert.deepEqual(afterUndo, enabled);
    await button("Play").click(); const playing = await checkOnion([]); await button("Pause").click(); await frame(layers[0], 1).click(); const paused = await checkOnion(["previous", "next"]); assert.deepEqual(paused, enabled);
    expectedSaveAsName = "Canonical Onion";
    await button("File").click(); await page.getByRole("menuitem", { name: "Save As", exact: true }).click(); await page.getByRole("status").filter({ hasText: "Saved on this browser" }).waitFor();
    const saved = await snapshot(page); assert.equal(saved.authored, before.authored);
    await page.goto(url); await page.getByRole("button", { name: /^Open Project/ }).click(); await button("Open Canonical Onion").click(); await settle(page);
    const reopened = await snapshot(page); assert.equal(reopened.authored, saved.authored); assert.equal(reopened.centeredPixels, saved.centeredPixels); assert.equal(reopened.centeredCoveragePixels, saved.centeredCoveragePixels);
    const reopenedOnion = await checkOnion(["previous", "next"]);
    await button("Onion").click(); const reopenedOff = await checkOnion([]), after = await snapshot(page); assert.equal(after.authored, before.authored);
    recordCase({ id: "onion-canonical-lifecycle", layers, authoredSources, before, after, views, enabled, off, offSnapshot, restored, edited, undone, afterUndo, playing, paused, saved, reopened, reopenedOnion, reopenedOff });
  };
  if (mode === "audio") {
    const { createPhase6Project, Phase6MemoryStorageAdapter } = await import("../../spec0006-unified/phase6FixtureFactory.ts");
    const { createPhase2Sources } = await import("../../spec0006-unified/phase2FixtureFactory.ts");
    const { createUnifiedProjectStorageV2 } = await import("../../../src/lib/animation/unifiedProjectStorageV2.ts");
    const source = (await createPhase2Sources()).find(value => value.sourceKind === "drawing-v1");
    assert.ok(source?.sourceKind === "drawing-v1");
    const project = await createPhase6Project(); project.title = "Phase1 Attached Sound"; project.revision = 1;
    const drawingSource = source.project as { data: { layers: Array<{ timelineFrames: Array<{ soundAttachment: NonNullable<typeof project.document.layers[0]["cells"][0]["content"]>["soundAttachment"] }> }> } };
    project.document.layers[0].cells[0].content!.soundAttachment = structuredClone(drawingSource.data.layers[0].timelineFrames[0].soundAttachment);
    const adapter = new Phase6MemoryStorageAdapter(); await createUnifiedProjectStorageV2(adapter).write(project, null);
    await page.evaluate(async input => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("diamond-animation-unified-v2", 2);
        request.onupgradeneeded = () => {
          const db = request.result;
          for (const name of ["projects", "heads"]) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "projectId" });
          if (!db.objectStoreNames.contains("versions")) db.createObjectStore("versions", { keyPath: ["projectId", "revision", "projectDigest"] });
          for (const name of ["assets", "assetMetadata"]) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "assetId" });
        };
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction(["heads", "versions", "assets", "assetMetadata"], "readwrite");
        for (const head of input.heads) tx.objectStore("heads").put(head);
        for (const version of input.versions) tx.objectStore("versions").put(version);
        for (const asset of input.assets) {
          const { bytesBase64, ...metadata } = asset;
          tx.objectStore("assets").put({ ...metadata, bytes: Uint8Array.from(atob(bytesBase64), value => value.charCodeAt(0)) }); tx.objectStore("assetMetadata").put(metadata);
        }
        tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
      }); database.close();
    }, { heads: [...adapter.heads.values()], versions: [...adapter.versions.values()], assets: [...adapter.assets.values()].map(({ bytes, ...asset }) => ({ ...asset, bytesBase64: Buffer.from(bytes).toString("base64") })) });
    const openAudio = async () => { await page.goto(url); await page.getByRole("button", { name: /^Open Project/ }).click(); await button(`Open ${project.title}`).click(); await page.locator('canvas[data-workspace-canvas="editable"]').waitFor(); await settle(page); };
    await openAudio(); const before = await snapshot(page), stored = await storeSnapshot(page);
    const cell = page.locator(`button[data-timeline-cell][data-layer-id="${project.document.layers[0].layerId}"][data-frame-index="0"]`).last();
    await cell.click({ button: "right" }); await button("Remove Attached Sound").click(); await settle(page); const after = await snapshot(page);
    const expectedLayers = structuredClone(before.normalizedLayers) as Array<{ timelineFrames: Array<{ soundAttachment: unknown }> }>;
    assert.ok(expectedLayers[0].timelineFrames[0].soundAttachment); expectedLayers[0].timelineFrames[0].soundAttachment = null;
    assert.deepEqual(after.normalizedLayers, expectedLayers); assert.equal(after.protected, before.protected); assert.equal(after.centeredPixels, before.centeredPixels); assert.equal(after.centeredCoveragePixels, before.centeredCoveragePixels);
    await button("Undo").click(); await settle(page); const undone = await snapshot(page); assert.equal(undone.authored, before.authored);
    await button("Redo").click(); await settle(page); const redone = await snapshot(page); assert.equal(redone.authored, after.authored);
    await cell.click({ button: "right" }); assert.equal(await button("Remove Attached Sound").isDisabled(), true); await page.keyboard.press("Escape");
    recordCase({ id: "remove-attached-sound-target", targetLayerId: project.document.layers[0].layerId, targetFrameIndex: 0, fixtureOrigin: "Published Phase6 fixture plus valid local Phase2 WAV, seeded only in this disposable browser context", before, after, undone, redone, completed: true });
    await button("File").click(); await page.getByRole("menuitem", { name: "Save", exact: true }).click(); await page.getByRole("status").filter({ hasText: "Saved on this browser" }).waitFor();
    await openAudio(); const reopened = await snapshot(page), afterStore = await storeSnapshot(page);
    assert.equal(reopened.authored, after.authored); assert.equal(reopened.centeredPixels, after.centeredPixels);
    for (const name of ["assets", "assetMetadata", "versions", "projects"]) for (const record of stored[name]) assert.ok(afterStore[name].some(value => JSON.stringify(value) === JSON.stringify(record)), `Remove sound preserves ${name}`);
    recordCase({ id: "removed-sound-save-open-assets-retained", after, reopened, stored, afterStore, completed: true });
    await capture(page, `${output}/audio-complete.png`); return;
  }
  if (mode === "accessibility") {
    await page.addScriptTag({ content: readFileSync("node_modules/axe-core/axe.min.js", "utf8") });
    const audits: unknown[] = [];
    const audit = async (id: string) => {
      const violations = await page.evaluate(async () => (window as unknown as { axe: { run: (node: Document, options: unknown) => Promise<{ violations: Array<{ id: string; impact: string; nodes: unknown[] }> }> } }).axe.run(document,
        { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] }, resultTypes: ["violations"] }).then(result => result.violations));
      audits.push({ id, violations }); operations.push({ id: `axe-${id}`, violations });
      assert.deepEqual(violations.filter(value => ["critical", "serious"].includes(value.impact)), [], `${id}: zero critical/serious Axe violations`);
    };
    for (const tool of ["Brush", "Pencil", "Sketch", "Pixelate", "Glow"]) { await variant(tool); await audit(tool); }
    const before = await snapshot(page);
    await page.getByRole("button", { name: /^Brush Tools:/ }).focus(); await page.keyboard.press("Enter"); await audit("open-brush-menu");
    await button("Sketch").focus(); await page.keyboard.press("Enter"); await page.getByRole("button", { name: "Brush Tools: Sketch", exact: true }).waitFor();
    const smoothing = page.getByLabel(/^Smoothing:/); await smoothing.focus(); await page.keyboard.press("Home"); assert.equal(await smoothing.inputValue(), "0"); await page.keyboard.press("End"); assert.equal(await smoothing.inputValue(), "100");
    await button("Brush").focus(); await page.keyboard.press("Tab"); const tabFocus = await page.evaluate(() => {
      const element = document.activeElement!, style = getComputedStyle(element);
      return { tag: element.tagName, label: element.getAttribute("aria-label") ?? element.getAttribute("title") ?? element.textContent, focusVisible: element.matches(":focus-visible"), outlineStyle: style.outlineStyle, outlineWidth: Number.parseFloat(style.outlineWidth), outlineColor: style.outlineColor };
    });
    assert.notEqual(tabFocus.tag, "BODY"); assert.equal((await snapshot(page)).authored, before.authored);
    assert.equal(tabFocus.focusVisible, true); assert.notEqual(tabFocus.outlineStyle, "none"); assert.ok(tabFocus.outlineWidth >= 2); await capture(page, `${output}/keyboard-focus.png`);
    recordCase({ id: "keyboard-focus-controls", tabFocus, before, after: await snapshot(page), completed: true });
    await page.evaluate(() => { document.documentElement.style.zoom = "2"; }); await settle(page);
    const zoom = await page.evaluate(() => ({ scale: getComputedStyle(document.documentElement).zoom, client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    assert.equal(Number(zoom.scale), 2); assert.ok(zoom.scroll <= zoom.client + 1, `200% document overflow: ${JSON.stringify(zoom)}`);
    await button("Brush").focus(); await page.keyboard.press("Enter"); await button("Select").scrollIntoViewIfNeeded();
    assert.ok(await page.locator('canvas[data-workspace-canvas="editable"]').isVisible()); assert.ok(await page.locator("button[data-timeline-cell]").first().isVisible());
    await capture(page, `${output}/zoom-200.png`); await audit("zoom-200");
    await page.evaluate(() => { document.documentElement.style.zoom = ""; }); await settle(page); assert.equal((await snapshot(page)).authored, before.authored);
    recordCase({ id: "zoom-200-controls", mechanism: "CSS 200% scaling, matching inherited browser methodology", zoom, before, after: await snapshot(page), completed: true });
    await page.emulateMedia({ reducedMotion: "reduce" }); const reducedMotionMatches = await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches); assert.equal(reducedMotionMatches, true);
    await variant("Sketch"); await button("Select").scrollIntoViewIfNeeded(); const a = await point(180, 180), b = await point(550, 300);
    const motionBefore = await snapshot(page); await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 16 }); const preview = await snapshot(page), frames = [];
    for (let i = 0; i < 10; i++) { await settle(page); const view = await snapshot(page); assert.equal(view.pixels, preview.pixels); frames.push(view.pixels); }
    await page.keyboard.press("Escape"); await page.mouse.up(); await settle(page); assert.equal((await snapshot(page)).authored, motionBefore.authored); assert.equal((await snapshot(page)).pixels, motionBefore.pixels);
    const release = await stroke([180, 180], [550, 300]); assert.equal(release.preview.pixels, release.after.pixels); await button("Undo").click(); await settle(page); assert.equal((await snapshot(page)).authored, motionBefore.authored);
    recordCase({ id: "reduced-motion-stationary-cancel-release", reducedMotionMatches, frames, before: motionBefore, preview, release, after: await snapshot(page), completed: true });
    assert.deepEqual(audits.map(value => (value as { id: string }).id).sort(), ["Brush", "Pencil", "Sketch", "Pixelate", "Glow", "open-brush-menu", "zoom-200"].sort());
    assert.ok(audits.every(value => (value as { violations: Array<{ impact: string }> }).violations.every(violation => !["critical", "serious"].includes(violation.impact))));
    recordCase({ id: "axe-complete", audits, completed: true });
    await capture(page, `${output}/accessibility-complete.png`); return;
  }
  if (process.argv.includes("--matrix") || process.argv.includes("--transitions") || process.argv.includes("--destructive") || process.argv.includes("--persistence") || process.argv.includes("--retention")) {
    const drag = async (from: [number, number], to: [number, number]) => {
      await button("Select").scrollIntoViewIfNeeded(); await settle(page);
      const a = await point(...from), b = await point(...to);
      await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 12 }); await page.mouse.up(); await settle(page);
    };
    const select = async (from: [number, number], to: [number, number], lasso = false) => {
      await button(lasso ? "Lasso" : "Select").click();
      if (!lasso) return drag(from, to);
      await button("Select").scrollIntoViewIfNeeded(); await settle(page);
      const a = await point(...from); await page.mouse.move(a.x, a.y); await page.mouse.down();
      for (const p of [[to[0], from[1]], to, [from[0], to[1]], from]) { const q = await point(p[0], p[1]); await page.mouse.move(q.x, q.y, { steps: 8 }); }
      await page.mouse.up(); await settle(page);
    };
    const draw = async (from: [number, number], to: [number, number]) => { await button("Brush").click(); await drag(from, to); };
    const limb = async (from: [number, number], to: [number, number]) => { await button("Stick Figure Tools").click(); await button("Add Limb").click(); await drag(from, to); };
    const convert = async (name: string) => {
      await page.getByRole("button", { name: /^Convert to Symbol/ }).click();
      const dialog = page.getByRole("dialog", { name: "Name this symbol" });
      await dialog.getByRole("textbox").fill(name); await dialog.getByRole("button", { name: "Create", exact: true }).click();
      await dialog.waitFor({ state: "hidden" }); await settle(page);
    };
    const place = async (name: string, x: number, y: number) => {
      await button("Library").click(); const item = page.getByText(name, { exact: true }); await item.scrollIntoViewIfNeeded();
      await button("Select").scrollIntoViewIfNeeded(); await settle(page);
      const box = (await item.boundingBox())!, target = await point(x, y);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(target.x, target.y, { steps: 20 }); await page.mouse.up();
      await button("Commit Placement").click(); await settle(page);
    };
    await draw([220, 180], [440, 240]); await select([160, 120], [500, 300]); await convert("Drawing");
    await draw([1110, 160], [1290, 230]); await limb([1160, 200], [1320, 360]);
    await select([1050, 100], [1380, 420], true); await convert("Mixed");
    const frame = (layer: string, index: number) => page.locator(`button[data-timeline-cell][data-layer-id="${layer}"][data-frame-index="${index}"]`).last();
    const layerIds = () => page.locator("button[data-timeline-cell][data-layer-id]").evaluateAll(cells => [...new Set(cells.map(cell => cell.getAttribute("data-layer-id")!))]);
    const firstLayer = (await layerIds())[0]; assert.ok(firstLayer, "live first layer id");
    for (let layerNumber = 0; layerNumber < 2; layerNumber++) {
      let layer = firstLayer;
      if (layerNumber === 1) { await button("+ Layer").click(); await settle(page); layer = (await layerIds()).find(id => id !== firstLayer)!; assert.ok(layer); await frame(layer, 0).click(); }
      for (let index = 0; index < 3; index++) {
        if (index) { await frame(layer, index - 1).click({ button: "right" }); await button("Insert Blank Keyframe").click(); await settle(page); }
        await place("Drawing", 320, 600); await place("Mixed", 1390, 600);
        await draw([200, 800], [430, 850]); await limb([660, 750], [830, 850]);
        await button("Text").click(); await button("Select").scrollIntoViewIfNeeded(); const q = await point(1050, 850); await page.mouse.click(q.x, q.y);
        await page.getByRole("textbox", { name: "Text", exact: true }).fill(`Protected ${layer}/${index}`); await button("Brush").click(); await settle(page);
      }
    }
    await frame(firstLayer, 0).click(); await button("Brush").click(); await settle(page);
    const fixtureSnapshot = await snapshot(page);
    assert.equal(fixtureSnapshot.inventory.layers, 2); assert.deepEqual(fixtureSnapshot.inventory.framesPerLayer, [3, 3]);
    assert.ok(fixtureSnapshot.inventory.rasterCells >= 6 && fixtureSnapshot.inventory.textObjects >= 6 && fixtureSnapshot.inventory.definitions >= 2 && fixtureSnapshot.inventory.mixedDefinitions >= 1 && fixtureSnapshot.inventory.rigCells >= 6 && fixtureSnapshot.inventory.instances >= 12, `protected fixture inventory: ${JSON.stringify(fixtureSnapshot.inventory)}`);
    recordCase({ id: "protected-two-layers-three-frames", fixtureSnapshot });
    await capture(page, `${output}/protected-fixture.png`);
    if (process.argv.includes("--retention")) {
      const roundTrip = async (id: string, action: () => Promise<void>) => {
        await button("Brush").click(); await settle(page); const before = await snapshot(page);
        const operation: BrowserRunMetrics["operations"][number] = { id, before }; operations.push(operation);
        await action(); await button("Brush").click(); await settle(page); const after = await snapshot(page); operation.after = after;
        assert.notEqual(after.authored, before.authored, `${id}: mutation occurs`); assert.equal(after.protected, before.protected, `${id}: protected symbols and rigs retained`);
        // Compound transforms consolidate pending local entries into global
        // history. One Undo/Redo below proves one action across that boundary.
        if (after.globalHistoryLength === before.globalHistoryLength) assert.equal(after.historyPosition, before.historyPosition + 1, `${id}: one local history entry`);
        await button("Undo").click(); await settle(page); const undone = await snapshot(page); operation.undone = undone;
        assert.equal(undone.authored, before.authored, `${id}: exact Undo`); assert.equal(undone.centeredPixels, before.centeredPixels);
        await button("Redo").click(); await settle(page); const redone = await snapshot(page); operation.redone = redone;
        assert.equal(redone.authored, after.authored, `${id}: exact Redo`); assert.equal(redone.centeredPixels, after.centeredPixels);
        await button("Undo").click(); await settle(page); recordCase(operation);
        console.log(JSON.stringify({ retention: id, status: "passed" }));
      };
      await roundTrip("shape-draw-retention", async () => { await button("Shape").click(); await button("Square").click(); await button("Draw").click(); await drag([800, 300], [1100, 550]); });
      await button("Redo").click(); await settle(page);
      await roundTrip("fill-retention", async () => {
        await button("Fill").click();
        await page.getByLabel("Fill color", { exact: true }).evaluate(element => {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, "#00aaff");
          element.dispatchEvent(new Event("input", { bubbles: true })); element.dispatchEvent(new Event("change", { bubbles: true }));
        });
        await setRange(/^Tolerance:/, 0);
        await button("Select").scrollIntoViewIfNeeded(); await settle(page);
        const q = await point(950, 425);
        const diagnostic = await page.evaluate(q => {
          const canvas = document.querySelector('canvas[data-workspace-canvas="editable"]')!;
          type Fiber = { return: Fiber | null; memoizedProps?: { fillColor?: string; activeTool?: string } };
          let fiber = (canvas as unknown as Record<string, Fiber>)[Object.keys(canvas).find(key => key.startsWith("__reactFiber$"))!]; const props = [];
          while (fiber) { if (fiber.memoizedProps?.fillColor) props.push({ fillColor: fiber.memoizedProps.fillColor, activeTool: fiber.memoizedProps.activeTool }); fiber = fiber.return!; }
          return { q, hit: document.elementFromPoint(q.x, q.y)?.outerHTML.slice(0, 400), props };
        }, q);
        operations.push({ id: "fill-input-diagnostic", diagnostic });
        assert.ok(diagnostic.props.some(value => value.fillColor === "#00aaff" && value.activeTool === "Fill"), "native Fill control updates the active authoring props");
        await page.mouse.click(q.x, q.y);
      });
      for (const lasso of [false, true]) for (const operation of ["move", "resize", "duplicate", "flip-x", "flip-y", "rotate"]) {
        await roundTrip(`${lasso ? "lasso" : "selection"}-${operation}-retention`, async () => {
          // Include the existing asymmetric raster line, away from text, rigs and instances.
          await select([170, 770], [460, 880], lasso);
          if (operation === "duplicate") await page.getByRole("button", { name: /^Duplicate(?:\s|$)/ }).click();
          else if (operation === "flip-x" || operation === "flip-y") await page.getByRole("button", { name: operation === "flip-x" ? /^Flip X(?:\s|$)/ : /^Flip Y(?:\s|$)/ }).click();
          else if (operation === "rotate") { await page.getByRole("textbox", { name: "Rotation", exact: true }).fill("25"); await page.keyboard.press("Enter"); }
          else {
            const box = await page.evaluate(resize => {
              const debug = (window as unknown as { __codexBitmapSelectionDebug: { items: Array<{ clientDisplayRect: { x: number; y: number; width: number; height: number }; clientHandleBounds: Record<string, { x: number; y: number; width: number; height: number }> }> } }).__codexBitmapSelectionDebug.items[0];
              return resize ? debug.clientHandleBounds.se : debug.clientDisplayRect;
            }, operation === "resize");
            assert.ok(box); const x = box.x + box.width / 2, y = box.y + box.height / 2;
            await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 20, y + 12, { steps: 12 }); await page.mouse.up();
          }
        });
      }
      // Text insertion is setup; the following text replacement is one command.
      await button("Text").click(); const textPoint = await point(850, 650); await page.mouse.click(textPoint.x, textPoint.y);
      await page.getByRole("textbox", { name: "Text", exact: true }).fill("Retention text"); await button("Brush").click(); await settle(page);
      await roundTrip("text-edit-retention", async () => {
        await button("Text").click(); await page.mouse.click(textPoint.x, textPoint.y);
        await page.getByRole("textbox", { name: "Text", exact: true }).fill("Retained text edited");
      });
      await frame(firstLayer, 0).click(); await frame(firstLayer, 0).click({ button: "right" }); await button("Copy Frame").click();
      const copySource = await snapshot(page); await frame(firstLayer, 2).click(); await settle(page); const pasteBefore = await snapshot(page);
      await frame(firstLayer, 2).click({ button: "right" }); await button("Paste Frame").click(); await settle(page); const pasteAfter = await snapshot(page);
      const sourceLayers = copySource.normalizedLayers as Array<{ id: string; timelineFrames: Array<{ bitmap: unknown }> }>;
      const pastedLayers = pasteAfter.normalizedLayers as typeof sourceLayers, previousLayers = pasteBefore.normalizedLayers as typeof sourceLayers;
      assert.deepEqual(pastedLayers.find(layer => layer.id === firstLayer)!.timelineFrames[2].bitmap, sourceLayers.find(layer => layer.id === firstLayer)!.timelineFrames[0].bitmap, "frame clipboard carries exact bitmap and coverage");
      for (const layer of pastedLayers) for (let i = 0; i < layer.timelineFrames.length; i++) if (layer.id !== firstLayer || i !== 2) {
        assert.deepEqual(layer.timelineFrames[i], previousLayers.find(previous => previous.id === layer.id)!.timelineFrames[i], "frame paste preserves all other cells");
      }
      await button("Undo").click(); await settle(page); const pasteUndone = await snapshot(page); assert.equal(pasteUndone.authored, pasteBefore.authored);
      await button("Redo").click(); await settle(page); const pasteRedone = await snapshot(page); assert.equal(pasteRedone.authored, pasteAfter.authored);
      await frame(firstLayer, 0).click(); await draw([220, 800], [330, 830]); await button("Undo").click(); await settle(page);
      const strokeUndone = await snapshot(page); assert.equal(strokeUndone.authored, pasteAfter.authored, "later source-frame edit cannot corrupt paste history");
      await frame(firstLayer, 2).click(); await button("Undo").click(); await settle(page); const pasteUndoneAfterStroke = await snapshot(page);
      assert.equal(pasteUndoneAfterStroke.authored, pasteBefore.authored, "Undo paste still restores all frames after another-frame draw/Undo");
      const clipboardOperation = { id: "frame-copy-paste-companion", source: copySource, targetLayerId: firstLayer, sourceFrameIndex: 0, targetFrameIndex: 2, before: pasteBefore, after: pasteAfter, undone: pasteUndone, redone: pasteRedone, strokeUndone, pasteUndoneAfterStroke };
      assertClipboardEvidence(clipboardOperation); recordCase(clipboardOperation);
      await frame(firstLayer, 0).click(); await settle(page);
      const beforeScrub = await snapshot(page), scrubs = [];
      for (const layer of await layerIds()) for (const index of [0, 1, 2, 1, 0]) { await frame(layer, index).click(); await settle(page); const view = await snapshot(page); assert.equal(view.authored, beforeScrub.authored); scrubs.push({ layer, index, view }); }
      await frame(firstLayer, 0).click(); await settle(page); assert.equal((await snapshot(page)).centeredPixels, beforeScrub.centeredPixels);
      recordCase({ id: "scrub-retention", before: beforeScrub, scrubs, after: await snapshot(page), completed: true });
      for (const [index, start, end] of [[0, [500, 100], [650, 130]], [2, [1250, 100], [1380, 130]]] as const) { await frame(firstLayer, index).click(); await draw([...start], [...end]); }
      await frame(firstLayer, 1).click(); await button("Brush").click(); await settle(page); const beforePlayback = await snapshot(page);
      await button("Onion").click(); await settle(page);
      const onion = await page.locator('canvas[data-workspace-canvas="onion"]').evaluate(element => {
        const canvas = element as HTMLCanvasElement, data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data; let purple = 0, green = 0;
        for (let i = 0; i < data.length; i += 4) if (data[i + 3]) { if (data[i + 2] > data[i] && data[i] > data[i + 1]) purple++; if (data[i + 1] > data[i + 2] && data[i + 2] > data[i]) green++; }
        return { purple, green };
      });
      assert.ok(onion.purple > 0 && onion.green > 0, `onion previous/next colors: ${JSON.stringify(onion)}`);
      await button("Onion").click(); await settle(page); assert.equal((await snapshot(page)).authored, beforePlayback.authored);
      await page.getByRole("spinbutton", { name: "FPS", exact: true }).fill("2"); await page.keyboard.press("Enter");
      await frame(firstLayer, 0).click(); await settle(page);
      const playbackPrecondition = await page.evaluate(before => {
        const canvas = document.querySelector('canvas[data-workspace-canvas="editable"]')!;
        type Frame = { bitmap: ImageData | null; cellType: string };
        type Layer = { id: string; timelineFrames: Frame[] };
        type Fiber = { return: Fiber | null; child: Fiber | null; sibling: Fiber | null; stateNode: { current?: Fiber }; memoizedState?: { memoizedState: { current?: unknown }; next: Fiber["memoizedState"] } };
        let root = (canvas as unknown as Record<string, Fiber>)[Object.keys(canvas).find(key => key.startsWith("__reactFiber$"))!]; while (root.return) root = root.return;
        const queue = [root.stateNode.current!], candidates = new Set<Layer[]>(), pending: boolean[] = [], selections: boolean[] = [];
        while (queue.length) {
          const node = queue.pop()!; let hook = node.memoizedState;
          while (hook) {
            const value = hook.memoizedState?.current;
            if (Array.isArray(value) && value[0]?.timelineFrames) candidates.add(value as Layer[]);
            const handle = value as { hasPendingAuthoringChanges?: () => boolean; hasActiveBitmapSelectionSession?: () => boolean } | null;
            if (typeof handle?.hasPendingAuthoringChanges === "function") pending.push(handle.hasPendingAuthoringChanges());
            if (typeof handle?.hasActiveBitmapSelectionSession === "function") selections.push(handle.hasActiveBitmapSelectionSession());
            hook = hook.next;
          }
          if (node.child) queue.push(node.child); if (node.sibling) queue.push(node.sibling);
        }
        if (candidates.size !== 1 || !pending.length || pending.some(Boolean) || !selections.length || selections.some(Boolean)) throw new Error("playback identity mapping requires one settled, clean authoring document");
        const layers = [...candidates][0], normalized = before.normalizedLayers as Array<{ id: string; timelineFrames: Array<{ bitmap: { pixels: string } }> }>;
        const playback = (window as unknown as { __phase1: { playback: PlaybackPaintProbe } }).__phase1.playback;
        for (const layer of layers) layer.timelineFrames.forEach((frame, frameIndex) => {
          if (!frame.bitmap || frame.cellType === "tween" || playback.expected.has(frame.bitmap)) throw new Error("playback fixture requires distinct non-tween bitmap identities");
          const bitmapHash = normalized.find(value => value.id === layer.id)!.timelineFrames[frameIndex].bitmap.pixels;
          playback.expected.set(frame.bitmap, { layerId: layer.id, frameIndex, bitmapHash });
        });
        if (layers.length !== 2 || playback.expected.size !== 6) throw new Error("playback fixture inventory changed");
        return { pending, selections, bitmaps: playback.expected.size, layerOrder: layers.map(layer => layer.id).reverse() };
      }, beforePlayback);
      await page.evaluate(({ layerId, layerOrder }) => {
        const playback = (window as unknown as { __phase1: { playback: PlaybackPaintProbe } }).__phase1.playback;
        playback.startedAt = performance.now(); playback.armed = true;
        (window as unknown as { __playbackObservation: Promise<unknown> }).__playbackObservation = (async () => {
          const observations: Array<{ key: string; at: number; playing: boolean; paintPassIndex: number }> = [], propsObservations: Array<{ key: string; at: number; playing: boolean }> = [], probeFailures: string[] = [], start = playback.startedAt;
          while (performance.now() - start < 6000) {
            const canvas = document.querySelector('canvas[data-workspace-canvas="editable"]')!;
            type Fiber = { return: Fiber | null; memoizedProps?: { authoringContextKey?: string; isTimelinePlaying?: boolean } };
            let fiber = (canvas as unknown as Record<string, Fiber>)[Object.keys(canvas).find(key => key.startsWith("__reactFiber$"))!], key = "", playing = false;
            while (fiber) { if (fiber.memoizedProps?.authoringContextKey && typeof fiber.memoizedProps.isTimelinePlaying === "boolean") { key = fiber.memoizedProps.authoringContextKey; playing = fiber.memoizedProps.isTimelinePlaying; } fiber = fiber.return!; }
            if (key && propsObservations.at(-1)?.key !== key) propsObservations.push({ key, at: performance.now() - start, playing });
            const surface = document.querySelector<HTMLCanvasElement>('canvas[data-workspace-canvas="playback"]')!;
            const visible = getComputedStyle(surface).opacity === "1", pass = playback.passes.at(-1), paintPassIndex = playback.passes.length - 1;
            if (pass && visible) {
              if (pass.draws.length !== layerOrder.length || pass.draws.some((draw, index) => draw.source?.layerId !== layerOrder[index] || draw.source.frameIndex !== pass.draws[0].source?.frameIndex)) { probeFailures.push("visible playback pass is partial or mixes frames"); break; }
              const paintedKey = `${layerId}:${pass.draws[0].source!.frameIndex}`;
              if (observations.at(-1)?.key !== paintedKey) observations.push({ key: paintedKey, at: performance.now() - start, playing: visible, paintPassIndex });
            }
            if (!visible && observations.length) { probeFailures.push("playback stopped before the observed full loop"); break; }
            const firstZero = observations.findIndex(value => Number(value.key.split(":").at(-1)) === 0);
            if (firstZero >= 0 && observations.length >= firstZero + 4) break;
            await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
          }
          playback.armed = false;
          return { observations, propsObservations, probeFailures, paintPasses: playback.passes };
        })();
      }, { layerId: firstLayer, layerOrder: playbackPrecondition.layerOrder });
      await button("Play").click();
      const playbackResult = await page.evaluate(() => (window as unknown as { __playbackObservation: Promise<{ observations: Array<{ key: string; at: number; playing: boolean; paintPassIndex: number }>; propsObservations: unknown[]; probeFailures: string[]; paintPasses: PlaybackPaintPass[] }> }).__playbackObservation);
      const playbackObservations = playbackResult.observations;
      const playbackStartIndex = playbackObservations.findIndex(value => Number(value.key.split(":").at(-1)) === 0);
      const traversed = playbackObservations.slice(playbackStartIndex, playbackStartIndex + 4).map(value => value.key);
      await button("Pause").click(); await settle(page);
      const playbackOperation = { id: "onion-full-playback-retention", onion, traversed, playbackObservations, playbackStartIndex, playbackPrecondition, playbackPaintPasses: playbackResult.paintPasses, playbackPropsObservations: playbackResult.propsObservations, playbackProbeFailures: playbackResult.probeFailures, before: beforePlayback, after: await snapshot(page), completed: false };
      operations.push(playbackOperation);
      assertPlaybackEvidence(playbackOperation); assert.equal(playbackOperation.after.authored, beforePlayback.authored); recordCase(playbackOperation);
      await capture(page, `${output}/retention-complete.png`);
      await proveOnionMask(); await proveOnionLifecycle(await layerIds(), frame); return;
    }
    if (process.argv.includes("--persistence")) {
      const save = async () => {
        const start = performance.now(); await button("File").click(); await page.getByRole("menuitem", { name: "Save", exact: true }).click();
        await page.getByRole("status").filter({ hasText: "Saved on this browser" }).waitFor(); await settle(page); return performance.now() - start;
      };
      const open = async (target: Page, title: string) => {
        await target.goto(url); await target.getByRole("button", { name: /^Open Project/ }).click();
        const start = performance.now(); await target.getByRole("button", { name: `Open ${title}`, exact: true }).click();
        await target.waitForFunction(() => { const canvas = document.querySelector('canvas[data-workspace-canvas="editable"]'); return canvas && (window as unknown as { __phase1: { coverage: WeakMap<object, { tiles: unknown[] }> } }).__phase1.coverage.get(canvas)?.tiles.length; });
        await settle(target); return performance.now() - start;
      };
      const preserved = (before: Awaited<ReturnType<typeof storeSnapshot>>, after: Awaited<ReturnType<typeof storeSnapshot>>) => {
        assert.deepEqual(after.heads, before.heads, "failed Save preserves last-good heads");
        for (const name of ["versions", "assets", "assetMetadata", "projects"]) for (const record of before[name]) {
          assert.ok(after[name].some(value => JSON.stringify(value) === JSON.stringify(record)), `failed Save preserves immutable ${name}`);
        }
      };
      const firstSaveMs = await save(); const saved = await snapshot(page); const savedStore = await storeSnapshot(page);
      await draw([800, 180], [1050, 220]); const later = await snapshot(page); const secondSaveMs = await save();
      assert.equal((await snapshot(page)).authored, later.authored, "Save preserves later marks");
      const openMs = await open(page, "Untitled Project"); const reopened = await snapshot(page);
      assert.equal(reopened.authored, later.authored); assert.equal(reopened.centeredPixels, later.centeredPixels); assert.equal(reopened.centeredCoveragePixels, later.centeredCoveragePixels);
      recordCase({ id: "protected-save-edit-save-open", firstSaveMs, secondSaveMs, openMs, saved, savedStore, later, reopened });
      const cleanStore = await storeSnapshot(page), activeHead = cleanStore.heads[0];
      const activeVersion = cleanStore.versions.find(value => value.projectId === activeHead.projectId && value.revision === activeHead.activeRevision && value.projectDigest === activeHead.projectDigest)!;
      const companionAssets: string[] = [];
      const findCompanionAssets = (value: unknown, companion = false) => {
        if (!value || typeof value !== "object") return;
        for (const [key, child] of Object.entries(value)) {
          if (companion && key === "__unifiedAssetRef" && typeof child === "string") companionAssets.push(child);
          else findCompanionAssets(child, companion || key === "paintCoverage");
        }
      };
      findCompanionAssets(activeVersion.encodedProject);
      const firstAssets = new Set(savedStore.assets.map(value => value.assetId));
      const recoveryAsset = companionAssets.find(assetId => !firstAssets.has(assetId)); assert.ok(recoveryAsset, "latest edit has an independently identifiable companion asset");
      for (const kind of ["missing", "corrupt"]) {
        await page.goto(url); await page.getByRole("button", { name: /^Open Project/ }).click();
        await page.evaluate(({ assetId, kind }) => {
          const original = IDBObjectStore.prototype.get; let hits = 0;
          IDBObjectStore.prototype.get = function(query) {
            const request = original.call(this, query);
            if (!hits && this.transaction.db.name === "diamond-animation-unified-v2" && this.name === "assets" && this.transaction.mode === "readonly" && query === assetId) {
              hits++;
              request.addEventListener("success", () => {
                const value = kind === "missing" ? undefined : structuredClone(request.result);
                if (value) value.bytes[0] ^= 1;
                Object.defineProperty(request, "result", { configurable: true, value });
              }, { once: true });
            }
            return request;
          };
          (window as unknown as { __recoveryFault: unknown }).__recoveryFault = { get hits() { return hits; }, restore() { IDBObjectStore.prototype.get = original; } };
        }, { assetId: recoveryAsset, kind });
        await button("Open Untitled Project").click(); await page.locator('canvas[data-workspace-canvas="editable"]').waitFor(); await settle(page);
        const hits = await page.evaluate(() => { const fault = (window as unknown as { __recoveryFault: { hits: number; restore(): void } }).__recoveryFault; fault.restore(); return fault.hits; });
        assert.equal(hits, 1); const recovered = await snapshot(page);
        assert.equal(recovered.authored, saved.authored); assert.equal(recovered.centeredPixels, saved.centeredPixels); assert.equal(recovered.centeredCoveragePixels, saved.centeredCoveragePixels);
        const recoveredStore = await storeSnapshot(page); assert.deepEqual(recoveredStore, cleanStore, "recovery never writes source stores");
        await open(page, "Untitled Project"); const latestAgain = await snapshot(page);
        assert.equal(latestAgain.authored, later.authored); assert.equal(latestAgain.centeredPixels, later.centeredPixels);
        recordCase({ id: `last-good-${kind}-companion`, hits, recoveryAsset, saved, recovered, later, latestAgain, beforeStore: cleanStore, afterStore: recoveredStore });
      }
      for (const fault of ["encode", "hash", "decode", "readback", "quota", "publish"]) {
        const before = await snapshot(page), beforeStore = await storeSnapshot(page);
        await page.evaluate(kind => {
          const root = window as unknown as { __saveFault: { hit: boolean; restore(): void } };
          const restorers: Array<() => void> = []; let hit = false;
          const fail = () => { hit = true; throw new Error(`phase1_injected_${kind}`); };
          if (kind === "hash") {
            const original = crypto.subtle.digest; restorers.push(() => { crypto.subtle.digest = original; });
            crypto.subtle.digest = function(...args: Parameters<typeof original>) { if (!hit) return Promise.reject(new Error(`phase1_injected_${kind}`)).finally(() => { hit = true; }); return original.apply(this, args); };
          } else if (kind === "encode") {
            const original = TextEncoder.prototype.encode; restorers.push(() => { TextEncoder.prototype.encode = original; });
            TextEncoder.prototype.encode = function(value) { if (!hit && value?.includes('"__unifiedAssetRef"')) fail(); return original.call(this, value); };
          } else if (kind === "decode") {
            const original = TextDecoder.prototype.decode; restorers.push(() => { TextDecoder.prototype.decode = original; });
            TextDecoder.prototype.decode = function(...args: Parameters<typeof original>) { const result = original.apply(this, args); if (!hit && /^data:(image|audio)\//.test(result)) fail(); return result; };
          } else {
            const method = kind === "readback" ? "get" : kind === "quota" ? "add" : "put";
            const original = IDBObjectStore.prototype[method];
            restorers.push(() => { IDBObjectStore.prototype[method] = original; });
            IDBObjectStore.prototype[method] = function(...args: Parameters<typeof original>) {
              if (!hit && this.transaction.db.name === "diamond-animation-unified-v2" &&
                (kind === "readback" ? this.name === "versions" && this.transaction.mode === "readonly" : kind === "quota" ? this.name === "versions" && this.transaction.mode === "readwrite" : this.name === "heads" && this.transaction.mode === "readwrite")) fail();
              return Reflect.apply(original, this, args);
            };
          }
          root.__saveFault = { get hit() { return hit; }, restore() { restorers.forEach(restore => restore()); } };
        }, fault);
        await button("File").click(); await page.getByRole("menuitem", { name: "Save", exact: true }).click();
        await page.getByRole("status").filter({ hasText: "Save failed" }).waitFor();
        const hit = await page.evaluate(() => { const fault = (window as unknown as { __saveFault: { hit: boolean; restore(): void } }).__saveFault; fault.restore(); return fault.hit; });
        assert.ok(hit, `${fault}: reached real Save pipeline`);
        await settle(page); const after = await snapshot(page), afterStore = await storeSnapshot(page);
        assert.equal(after.authored, before.authored); assert.equal(after.pixels, before.pixels); assert.equal(after.coveragePixels, before.coveragePixels); assert.equal(after.historyPosition, before.historyPosition);
        preserved(beforeStore, afterStore);
        recordCase({ id: `save-${fault}-failure`, hit, before, after, beforeStore, afterStore });
        await save(); console.log(JSON.stringify({ persistence: fault, status: "passed" }));
      }
      const gate = await page.evaluateHandle(() => {
        const original = crypto.subtle.digest.bind(crypto.subtle); let release!: () => void;
        const blocked = new Promise<void>(resolve => { release = resolve; });
        crypto.subtle.digest = async (...args: Parameters<typeof original>) => { await blocked; return original(...args); };
        return { release() { crypto.subtle.digest = original; release(); } };
      });
      await button("File").click(); await page.getByRole("menuitem", { name: "Save", exact: true }).click();
      await page.getByRole("status").filter({ hasText: "Saving" }).waitFor();
      await draw([900, 260], [1200, 310]);
      // Snapshot hashing uses SubtleCrypto too, so release the gate before
      // measuring the current edit, then compare again after Save settles.
      await gate.evaluate(value => value.release()); const newerEdit = await snapshot(page);
      await page.getByRole("status").filter({ hasText: "Unsaved changes" }).waitFor(); const delayed = await snapshot(page);
      assert.equal(delayed.authored, newerEdit.authored); assert.equal(delayed.pixels, newerEdit.pixels); assert.equal(delayed.coveragePixels, newerEdit.coveragePixels);
      recordCase({ id: "delayed-save-keeps-newer-edit-dirty", newerEdit, delayed, dirtyStatus: await page.getByRole("status").filter({ hasText: "Unsaved changes" }).innerText() }); await save();
      const second = await context.newPage();
      await open(second, "Untitled Project");
      await draw([900, 340], [1200, 370]); await save(); const headAfterFirst = await storeSnapshot(page);
      await second.getByRole("button", { name: "File", exact: true }).click(); await second.getByRole("menuitem", { name: "Save", exact: true }).click();
      await second.getByRole("status").filter({ hasText: "Save failed" }).waitFor();
      assert.deepEqual((await storeSnapshot(second)).heads, headAfterFirst.heads, "stale tab cannot overwrite current head");
      recordCase({ id: "concurrent-tab-stale-cas", headAfterFirst, headAfterRejected: await storeSnapshot(second) }); await second.close();
      const savedOriginal = await snapshot(page), originalStore = await storeSnapshot(page);
      await draw([800, 420], [1200, 480]); const unsavedOriginal = await snapshot(page);
      expectedSaveAsName = "Protected failed copy";
      await page.evaluate(() => {
        const original = crypto.subtle.digest; let hit = false;
        crypto.subtle.digest = function(...args: Parameters<typeof original>) { if (!hit) { hit = true; return Promise.reject(new Error("phase1_save_as_hash")); } return original.apply(this, args); };
        (window as unknown as { __saveAsFault: unknown }).__saveAsFault = { get hit() { return hit; }, restore() { crypto.subtle.digest = original; } };
      });
      await button("File").click(); await page.getByRole("menuitem", { name: "Save As", exact: true }).click(); await page.getByRole("status").filter({ hasText: "Save failed" }).waitFor();
      assert.ok(await page.evaluate(() => { const fault = (window as unknown as { __saveAsFault: { hit: boolean; restore(): void } }).__saveAsFault; fault.restore(); return fault.hit; }));
      const failedCopy = await snapshot(page); assert.equal(failedCopy.authored, unsavedOriginal.authored); preserved(originalStore, await storeSnapshot(page));
      recordCase({ id: "save-as-failure-retains-unsaved-and-source", unsavedOriginal, failedCopy, originalStore, afterStore: await storeSnapshot(page) });
      expectedSaveAsName = "Protected Phase 1 copy";
      const original = await snapshot(page); await button("File").click(); await page.getByRole("menuitem", { name: "Save As", exact: true }).click();
      await page.getByRole("status").filter({ hasText: "Saved on this browser" }).waitFor();
      await open(page, "Protected Phase 1 copy"); const copy = await snapshot(page);
      await open(page, "Untitled Project"); const originalAgain = await snapshot(page);
      assert.equal(copy.centeredPixels, original.centeredPixels); assert.equal(originalAgain.centeredPixels, savedOriginal.centeredPixels);
      assert.equal(copy.centeredCoveragePixels, original.centeredCoveragePixels); assert.equal(originalAgain.centeredCoveragePixels, savedOriginal.centeredCoveragePixels);
      const copiedStore = await storeSnapshot(page);
      assert.ok(copiedStore.heads.some(value => JSON.stringify(value) === JSON.stringify(originalStore.heads[0])), "Save As preserves original durable identity and revision");
      recordCase({ id: "protected-save-as-original-copy", original, savedOriginal, copy, originalAgain, originalStore, copiedStore });
      await capture(page, `${output}/persistence-complete.png`); return;
    }
    if (process.argv.includes("--destructive")) {
      const roundTrip = async (id: string, action: (operation: BrowserRunMetrics["operations"][number]) => Promise<void>) => {
        const allowedRect = ({ "eraser-target": [900, 320, 900, 530], "knife-target": [790, 290, 1110, 560], "shape-cutout-target": [838, 318, 922, 442], "delete-selection-target": [818, 328, 922, 462] } as Record<string, number[]>)[id] ?? null;
        await button("Brush").click(); await settle(page); const before = await snapshot(page, allowedRect);
        const separator = before.authoringContext.lastIndexOf(":");
        const operation: BrowserRunMetrics["operations"][number] = { id, before, targetLayerId: before.authoringContext.slice(0, separator), targetFrameIndex: Number(before.authoringContext.slice(separator + 1)) }; operations.push(operation);
        await action(operation); await settle(page); const activeResult = await snapshot(page);
        await button("Brush").click(); await settle(page); const after = await snapshot(page, allowedRect);
        operation.activeResult = activeResult; operation.after = after;
        assert.equal(after.authored, activeResult.authored, `${id}: dismissing selection preserves authored data`);
        assert.notEqual(after.authored, before.authored, `${id}: mutation occurs`);
        await button("Undo").click(); await settle(page); const undone = await snapshot(page);
        operation.undone = undone;
        assert.equal(undone.authored, before.authored, `${id}: exact Undo authored data`);
        assert.equal(undone.pixels, before.pixels, `${id}: exact Undo presentation`);
        await button("Redo").click(); await settle(page); const redone = await snapshot(page);
        operation.redone = redone;
        assert.equal(redone.authored, after.authored, `${id}: exact Redo authored data`);
        assert.equal(redone.pixels, after.pixels, `${id}: exact Redo presentation`);
        assertDestructiveEvidence(operation);
        await button("Undo").click(); await settle(page);
        recordCase(operation);
        console.log(JSON.stringify({ destructive: id, status: "passed" }));
      };
      await button("Shape").click(); await button("Square").click(); await drag([800, 300], [1100, 550]);
      await button("Brush").click(); await settle(page);
      await roundTrip("eraser-target", async () => { await button("Eraser").click(); await setRange(/^Eraser size:/, 12); await drag([900, 320], [900, 530]); });
      await roundTrip("knife-target", async () => { await button("Knife").click(); await drag([950, 250], [950, 600]); });
      await roundTrip("shape-cutout-target", async () => { await button("Shape").click(); await button("Square").click(); await button("Cutout").click(); await drag([840, 320], [920, 440]); });
      await roundTrip("delete-selection-target", async () => { await select([820, 330], [920, 460]); await page.getByRole("button", { name: /^Delete(?:\s|$)/ }).click(); });
      await roundTrip("remove-frame-target", async () => { await frame(firstLayer, 0).click({ button: "right" }); await button("Remove Frame").click(); });
      const otherLayer = (await layerIds()).find(id => id !== firstLayer)!;
      await frame(otherLayer, 0).click(); await button("Brush").click(); await settle(page);
      const beforeRejectedLayer = await snapshot(page);
      expectedConfirmation = { message: "Delete the active layer?", accept: false };
      await frame(otherLayer, 0).click({ button: "right" }); await button("Delete Layer").click(); await settle(page);
      const afterRejectedLayer = await snapshot(page); assert.equal(afterRejectedLayer.authored, beforeRejectedLayer.authored, "dismissed layer deletion retains document");
      assert.equal(expectedConfirmation, null); recordCase({ id: "layer-confirmation-dismissed", before: beforeRejectedLayer, after: afterRejectedLayer, confirmationDismissed: true });
      await roundTrip("delete-layer-target", async () => { expectedConfirmation = { message: "Delete the active layer?", accept: true }; await frame(otherLayer, 0).click({ button: "right" }); await button("Delete Layer").click(); });
      await frame(firstLayer, 0).click(); await button("Brush").click(); await settle(page);
      await button("Select").click(); const beforeRejectedClear = await snapshot(page);
      expectedConfirmation = { message: "Clear the current canvas? This will remove the visible artwork on this canvas.", accept: false };
      await button("Clear Canvas").click(); await settle(page); const afterRejectedClear = await snapshot(page);
      assert.equal(afterRejectedClear.authored, beforeRejectedClear.authored); assert.equal(afterRejectedClear.pixels, beforeRejectedClear.pixels); assert.equal(afterRejectedClear.coveragePixels, beforeRejectedClear.coveragePixels);
      assert.equal(expectedConfirmation, null); recordCase({ id: "clear-confirmation-dismissed", before: beforeRejectedClear, after: afterRejectedClear, confirmationDismissed: true });
      await roundTrip("clear-canvas-target", async () => {
        await button("Select").click(); expectedConfirmation = { message: "Clear the current canvas? This will remove the visible artwork on this canvas.", accept: true }; await button("Clear Canvas").click();
      });
      await button("Redo").click(); await settle(page); const cleared = await snapshot(page);
      await draw([700, 200], [1000, 250]); await button("Undo").click(); await settle(page); assert.equal((await snapshot(page)).authored, cleared.authored);
      await button("Undo").click(); await settle(page); const beforeClearAgain = await snapshot(page);
      await button("Redo").click(); await settle(page); const clearedAgain = await snapshot(page); assert.equal(clearedAgain.authored, cleared.authored);
      await button("Undo").click(); await settle(page);
      recordCase({ id: "clear-draw-undo-redo-history-isolation", cleared, beforeClearAgain, clearedAgain, completed: true });
      await roundTrip("delete-instance-target", async operation => {
        await button("Select").click(); await button("Select").scrollIntoViewIfNeeded();
        operation.targetItemId = await page.locator("[data-unified-symbol-instance]").first().getAttribute("data-unified-symbol-instance");
        await page.locator("[data-unified-symbol-instance] [data-symbol-hit-target]").first().click(); await button("Delete Instance").click();
      });
      await button("Library").click(); const beforeReferenced = await snapshot(page);
      await page.getByRole("button", { name: "Delete Drawing definition", exact: true }).click();
      await page.getByText("Delete the symbol instances that use this definition first.", { exact: true }).waitFor();
      assert.equal((await snapshot(page)).authored, beforeReferenced.authored, "referenced definition rejection retains document");
      recordCase({ id: "referenced-definition-rejected", before: beforeReferenced, after: await snapshot(page) });
      await draw([400, 350], [600, 400]); await select([350, 300], [650, 450]); await convert("Scratch definition");
      await roundTrip("delete-definition-target", async operation => {
        const before = operation.before as Awaited<ReturnType<typeof snapshot>>;
        const catalogs = (before.normalizedProtected as Array<{ symbols?: Array<{ definitionId: string; name: string }> }>).find(value => value.symbols);
        operation.targetDefinitionId = catalogs?.symbols?.find(value => value.name === "Scratch definition")?.definitionId; assert.ok(operation.targetDefinitionId);
        await button("Library").click(); await page.getByRole("button", { name: "Delete Scratch definition definition", exact: true }).click();
      });
      await capture(page, `${output}/destructive-complete.png`);
      await page.goto(url); await page.getByRole("button", { name: /^New Project/ }).click(); await settle(page); const minimumBefore = await snapshot(page);
      await page.locator("button[data-timeline-cell]").first().click({ button: "right" });
      const minimumGuards = { removeFrameDisabled: await button("Remove Frame").isDisabled(), deleteLayerDisabled: await button("Delete Layer").isDisabled() };
      assert.equal(minimumGuards.deleteLayerDisabled, true);
      if (minimumGuards.removeFrameDisabled) await page.keyboard.press("Escape"); else await button("Remove Frame").click();
      await settle(page); const minimumResult = await snapshot(page); assert.equal(minimumResult.inventory.layers, 1); assert.deepEqual(minimumResult.inventory.framesPerLayer, [1]);
      if (minimumResult.authored !== minimumBefore.authored) { await button("Undo").click(); await settle(page); }
      const minimumAfter = await snapshot(page); assert.equal(minimumAfter.authored, minimumBefore.authored); assert.equal(minimumAfter.inventory.layers, 1); assert.deepEqual(minimumAfter.inventory.framesPerLayer, [1]);
      recordCase({ id: "minimum-frame-layer-guards", before: minimumBefore, after: minimumAfter, minimumResult, ...minimumGuards });
      for (const tool of ["Pencil", "Sketch"]) for (const transparency of [0, 50]) {
        await page.goto(url); await page.getByRole("button", { name: /^New Project/ }).click(); await settle(page);
        await variant(tool); await setRange(/size:/, 24); await setRange(/^Smoothing:/, 100); await setRange(/^Transparency:/, transparency);
        await page.locator('input[type="color"]').first().fill("#ff0000"); await settle(page);
        await stroke([750, 200], [750, 900]); const opacityByte = Math.round(255 * (1 - transparency / 100));
        const authoredStroke = await inspectKnife(opacityByte, true, tool === "Sketch"); assert.ok(authoredStroke.canvas.painted > 100);
        if (tool === "Sketch") {
          assert.equal(authoredStroke.targetPixelCount, authoredStroke.canvas.painted); assert.ok(authoredStroke.detachedPixels > 0);
          await setRange(/size:/, 4);
          const marker = await page.evaluate(() => {
            const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-workspace-canvas="editable"]')!, data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data, rect = canvas.getBoundingClientRect();
            let maxX = 0, minY = canvas.height, maxY = 0;
            for (let p = 0; p < data.length / 4; p++) if (data[p * 4 + 3]) { maxX = Math.max(maxX, p % canvas.width); minY = Math.min(minY, Math.floor(p / canvas.width)); maxY = Math.max(maxY, Math.floor(p / canvas.width)); }
            return { x: rect.x + (maxX + 1) * rect.width / canvas.width + 20, y: rect.y + (minY + (maxY - minY) * .2) * rect.height / canvas.height };
          });
          await page.mouse.click(marker.x, marker.y); await settle(page);
        }
        const initial = await inspectKnife(opacityByte, false, false, true);
        if (tool === "Sketch") { assert.ok(initial.unrelatedPainted > 0); assert.equal(initial.targetPixelCount, authoredStroke.canvas.painted); }
        await button("Knife").click(); await stroke([500, 550], [1000, 550]);
        const cut = await inspectKnife(opacityByte), cutSnapshot = await snapshot(page); assert.equal(cut.items.length, 2);
        const target = cut.items[0], moveCount = tool === "Sketch" ? 2 : 1;
        for (let index = 0; index < moveCount; index++) {
          const moving = (await inspectKnife(opacityByte)).items[index];
          await page.mouse.move(moving.screen.x, moving.screen.y); await page.mouse.down();
          await page.mouse.move(moving.screen.x + 130, moving.screen.y, { steps: 12 }); await page.mouse.up(); await settle(page);
        }
        const moved = await inspectKnife(opacityByte), movedSnapshot = await snapshot(page);
        assert.notEqual(movedSnapshot.authored, cutSnapshot.authored); assert.notEqual(moved.items[0].x, target.x);
        assert.equal(moved.canvas.pixelHash, cut.canvas.pixelHash, "moving cut pieces leaves the cleared backdrop exactly unchanged");
        assert.equal(moved.canvas.coverageHash, cut.canvas.coverageHash, "moving cut pieces leaves the backdrop companion exactly unchanged");
        const settledFrames = [];
        for (let i = 0; i < 10; i++) { await settle(page); settledFrames.push(await inspectKnife(opacityByte)); }
        for (const state of [initial, cut, moved, ...settledFrames]) for (const surface of [state.canvas, ...state.items.map(item => item.pixels)]) {
          assert.equal(surface.mismatch, 0, "pixels and companion agree throughout cut and move");
          assert.equal(surface.wrongOpacity, 0, "no pale interior, outline, or detached marks"); assert.equal(surface.wrongColor, 0);
        }
        for (const state of [cut, moved, ...settledFrames]) { assert.equal(state.originGhostPixels, 0, "no target pixels or detached dabs remain at the cut source"); assert.equal(state.untouchedChanges, 0, "unrelated backdrop remains exact"); }
        await capture(page, `${output}/knife-${tool}-${transparency}-moved.png`);
        for (let index = 0; index < moveCount; index++) { await button("Undo").click(); await settle(page); }
        const revertedSnapshot = await snapshot(page); assert.equal(revertedSnapshot.authored, cutSnapshot.authored);
        for (let index = 0; index < moveCount; index++) { await button("Redo").click(); await settle(page); }
        const replayedSnapshot = await snapshot(page); assert.equal(replayedSnapshot.authored, movedSnapshot.authored);
        expectedSaveAsName = `Knife ${tool} ${transparency}`;
        await button("File").click(); await page.getByRole("menuitem", { name: "Save As", exact: true }).click(); await page.getByRole("status").filter({ hasText: "Saved on this browser" }).waitFor();
        const savedSnapshot = await snapshot(page), saved = await inspectKnife(opacityByte); assert.equal(savedSnapshot.authored, movedSnapshot.authored);
        await page.goto(url); await page.getByRole("button", { name: /^Open Project/ }).click(); await button(`Open Knife ${tool} ${transparency}`).click(); await settle(page);
        const reopenedSnapshot = await snapshot(page), reopened = await inspectKnife(opacityByte);
        assert.equal(reopenedSnapshot.authored, savedSnapshot.authored); assert.equal(reopenedSnapshot.centeredPixels, savedSnapshot.centeredPixels); assert.equal(reopenedSnapshot.centeredCoveragePixels, savedSnapshot.centeredCoveragePixels);
        for (const state of [saved, reopened]) { assert.equal(state.canvas.mismatch, 0); assert.equal(state.canvas.wrongOpacity, 0); assert.equal(state.canvas.wrongColor, 0); }
        recordCase({ id: `knife-texture/${tool}/${transparency}`, tool, transparency, opacityByte, moveCount, authoredStroke, initial, cut, moved, settledFrames, cutSnapshot, movedSnapshot, revertedSnapshot, replayedSnapshot, savedSnapshot, reopenedSnapshot, saved, reopened });
      }
      return;
    }
    if (process.argv.includes("--transitions")) {
      const keyboardActivate = async (control: ReturnType<typeof button>) => { await control.focus(); await page.keyboard.press("Enter"); await settle(page); };
      const begin = async () => {
        await button("Brush").click(); await button("Select").scrollIntoViewIfNeeded(); await settle(page);
        const a = await point(220, 340), b = await point(670, 410);
        await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 16 });
      };
      const assertRetained = (id: string, before: Awaited<ReturnType<typeof snapshot>>, after: Awaited<ReturnType<typeof snapshot>>) => {
        for (const key of ["authored", "pixels", "coveragePixels", "historyPosition", "historyLength"] as const) assert.equal(after[key], before[key], `${id}: ${key}`);
      };
      await variant("Sketch"); const stationaryBefore = await snapshot(page); await begin();
      const stationaryPreview = await snapshot(page);
      const stationaryFrames = [], stationaryCoverageFrames = [];
      for (let i = 0; i < 10; i++) { await settle(page); const view = await snapshot(page); assert.equal(view.pixels, stationaryPreview.pixels); assert.equal(view.coveragePixels, stationaryPreview.coveragePixels); stationaryFrames.push(view.pixels); stationaryCoverageFrames.push(view.coveragePixels); }
      await page.keyboard.press("Escape"); await page.mouse.up(); await settle(page);
      const stationaryAfter = await snapshot(page); assertRetained("stationary-sketch", stationaryBefore, stationaryAfter);
      recordCase({ id: "stationary-sketch", before: stationaryBefore, preview: stationaryPreview, frames: stationaryFrames, coverageFrames: stationaryCoverageFrames, after: stationaryAfter });
      const otherLayer = (await layerIds()).find(id => id !== firstLayer)!;
      for (const cancellation of ["escape", "pointercancel", "lostcapture", "tool", "tab", "frame", "layer", "playback"] as const) {
        await frame(firstLayer, cancellation === "frame" ? 1 : 0).click(); await settle(page);
        await button("Brush").click(); const before = await snapshot(page); await begin(); const preview = await snapshot(page);
        if (cancellation === "escape") await page.keyboard.press("Escape");
        else if (cancellation === "pointercancel") await page.locator('canvas[data-workspace-canvas="editable"]').dispatchEvent("pointercancel", { pointerId: 1, isPrimary: true, pointerType: "mouse" });
        else if (cancellation === "lostcapture") await page.locator('canvas[data-workspace-canvas="editable"]').evaluate(canvas => (canvas as HTMLCanvasElement).releasePointerCapture(1));
        else if (cancellation === "tool") await keyboardActivate(button("Select"));
        else if (cancellation === "tab") await keyboardActivate(button("Library"));
        else if (cancellation === "frame") await keyboardActivate(frame(firstLayer, 0));
        else if (cancellation === "layer") await keyboardActivate(frame(otherLayer, 0));
        else await keyboardActivate(button("Play"));
        await page.mouse.up(); await settle(page);
        if (cancellation === "playback") { await button("Pause").click(); await settle(page); }
        await frame(firstLayer, cancellation === "frame" ? 1 : 0).click(); await button("Brush").click(); await settle(page);
        const after = await snapshot(page); assertRetained(cancellation, before, after);
        recordCase({ id: `${cancellation}-cancel`, before, preview, after });
      }
      await frame(firstLayer, 0).click(); await settle(page);
      const beforeFault = await snapshot(page); await begin(); const faultPreview = await snapshot(page);
      expectedAlert = /stroke could not be committed/;
      await page.evaluate(() => {
        const original = window.ImageData;
        window.ImageData = new Proxy(original, { construct() {
          window.ImageData = original;
          throw new DOMException("Injected canonical snapshot allocation failure", "InvalidStateError");
        } });
      });
      await page.mouse.up(); await settle(page);
      const afterFault = await snapshot(page); assertRetained("snapshot-failure", beforeFault, afterFault); assert.equal(expectedAlert, null);
      recordCase({ id: "snapshot-failure-rollback", before: beforeFault, preview: faultPreview, after: afterFault });
      const beforeResize = await snapshot(page);
      await page.setViewportSize({ width: profile.width, height: Math.max(640, profile.height - 180) }); await settle(page);
      await page.setViewportSize({ width: profile.width, height: profile.height }); await settle(page);
      const afterResize = await snapshot(page); assertRetained("shrink-grow", beforeResize, afterResize);
      recordCase({ id: "viewport-shrink-grow-retention", before: beforeResize, after: afterResize });
      await variant("Brush"); await setRange(/^Transparency:/, 50); await setRange(/^Smoothing:/, 50);
      const editable = page.locator('canvas[data-workspace-canvas="editable"]');
      for (const terminal of ["outside-release", "leave-return"]) {
        await button("Select").scrollIntoViewIfNeeded(); const before = await snapshot(page);
        const a = await point(700, 300), b = await point(1100, 350), bounds = (await editable.boundingBox())!;
        await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 12 });
        await page.mouse.move(bounds.x + bounds.width + 20, b.y, { steps: 6 });
        const outside = await snapshot(page); assert.equal(outside.authored, before.authored); assert.equal(outside.historyPosition, before.historyPosition, "leaving cannot commit");
        if (terminal === "leave-return") await page.mouse.move(b.x, b.y, { steps: 6 });
        const preview = await snapshot(page); await page.mouse.up(); await settle(page); const after = await snapshot(page);
        assert.equal(after.pixels, preview.pixels); assert.equal(after.coveragePixels, preview.coveragePixels); assert.equal(after.historyPosition, before.historyPosition + 1);
        await button("Undo").click(); await settle(page); const undone = await snapshot(page); assert.equal(undone.authored, before.authored);
        await button("Redo").click(); await settle(page); const redone = await snapshot(page); assert.equal(redone.authored, after.authored); await button("Undo").click(); await settle(page);
        recordCase({ id: terminal, before, outside, preview, after, undone, redone, completed: true });
      }
      const finalBefore = await snapshot(page), a = await point(650, 250), b = await point(850, 300), c = await point(1080, 260);
      await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y);
      await editable.dispatchEvent("pointerup", { pointerId: 1, isPrimary: true, pointerType: "mouse", clientX: c.x, clientY: c.y, buttons: 0 });
      await page.mouse.up(); await settle(page); const terminalSample = await snapshot(page);
      assert.equal(terminalSample.historyPosition, finalBefore.historyPosition + 1);
      await button("Undo").click(); await settle(page);
      await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y); await page.mouse.move(c.x, c.y); await page.mouse.up(); await settle(page);
      const movedSample = await snapshot(page); assert.equal(movedSample.pixels, terminalSample.pixels); assert.equal(movedSample.coveragePixels, terminalSample.coveragePixels);
      await button("Undo").click(); await settle(page); const finalUndone = await snapshot(page); assert.equal(finalUndone.authored, finalBefore.authored);
      recordCase({ id: "pointerup-final-sample-once", before: finalBefore, terminalSample, movedSample, undone: finalUndone, completed: true });
      for (const owner of ["frame", "layer"]) {
        await frame(firstLayer, 0).click(); await button("Brush").click(); await settle(page);
        await page.evaluate(() => {
          const original = window.requestIdleCallback, cancel = window.cancelIdleCallback;
          let next = 1000000; const callbacks = new Map<number, IdleRequestCallback>(), cancelled = new Set<number>();
          window.requestIdleCallback = callback => { const id = next++; callbacks.set(id, callback); return id; };
          window.cancelIdleCallback = id => { if (callbacks.has(id)) cancelled.add(id); else cancel(id); };
          (window as unknown as { __queuedCapture: unknown }).__queuedCapture = { callbacks, cancelled, restore() { window.requestIdleCallback = original; window.cancelIdleCallback = cancel; } };
        });
        await draw([900, 460], [1150, 490]);
        const staleIds = await page.evaluate(() => [...(window as unknown as { __queuedCapture: { callbacks: Map<number, unknown> } }).__queuedCapture.callbacks.keys()]);
        assert.ok(staleIds.length > 0, "real pointerup queued a capture callback");
        await keyboardActivate(frame(owner === "frame" ? firstLayer : otherLayer, owner === "frame" ? 1 : 0));
        await draw([950, 520], [1200, 550]); const before = await snapshot(page);
        const invoked = await page.evaluate(ids => {
          const gate = (window as unknown as { __queuedCapture: { callbacks: Map<number, IdleRequestCallback>; cancelled: Set<number>; restore(): void } }).__queuedCapture;
          let invoked = 0; const cancelled = ids.filter(id => gate.cancelled.has(id)).length;
          try { for (const id of ids) { const callback = gate.callbacks.get(id); if (callback) { callback({ didTimeout: true, timeRemaining: () => 50 }); invoked++; } } }
          finally { gate.restore(); }
          return { invoked, cancelled };
        }, staleIds);
        await settle(page); const after = await snapshot(page); assertRetained(`stale queued ${owner}`, before, after);
        assert.equal(invoked.invoked, staleIds.length); assert.ok(invoked.cancelled > 0);
        recordCase({ id: `stale-queued-${owner}-capture`, before, after, staleIds, ...invoked });
      }
      await frame(firstLayer, 0).click(); await button("Brush").click(); await settle(page);
      await button("File").click(); await page.getByRole("menuitem", { name: "Save", exact: true }).click(); await page.getByRole("status").filter({ hasText: "Saved on this browser" }).waitFor();
      const savedBeforeClose = await snapshot(page); await begin(); const pendingBeforeClose = await snapshot(page); assert.equal(pendingBeforeClose.authored, savedBeforeClose.authored); assert.notEqual(pendingBeforeClose.pixels, savedBeforeClose.pixels);
      await page.close(); const reopenedPage = await context.newPage(); activePage = reopenedPage;
      await reopenedPage.goto(url); await reopenedPage.getByRole("button", { name: /^Open Project/ }).click(); await reopenedPage.getByRole("button", { name: "Open Untitled Project", exact: true }).click();
      await reopenedPage.locator('canvas[data-workspace-canvas="editable"]').waitFor(); await settle(reopenedPage); const reopenedAfterClose = await snapshot(reopenedPage);
      assert.equal(reopenedAfterClose.authored, savedBeforeClose.authored); assert.equal(reopenedAfterClose.centeredPixels, savedBeforeClose.centeredPixels); assert.equal(reopenedAfterClose.centeredCoveragePixels, savedBeforeClose.centeredCoveragePixels);
      recordCase({ id: "project-close-unpublished-draft", savedBeforeClose, pendingBeforeClose, reopenedAfterClose, completed: true });
      await capture(reopenedPage, `${output}/transitions-complete.png`);
      return;
    }
    const fixture = JSON.parse(readFileSync("scripts/fixtures/spec0007-manual/phase-1/contract.json", "utf8"));
    for (const tool of ["Brush", "Pencil", "Sketch", "Pixelate", "Glow"]) {
      await variant(tool);
      for (const level of [0, 50, 100]) {
        await setRange(/size:/, level === 0 ? 1 : level === 50 ? 12 : 24);
        await setRange(/^Smoothing:/, level); await setRange(/^Transparency:/, 100 - level);
        if (tool === "Glow") { await setRange(/^Gradient Brightness:/, level); await setRange(/^Gradient Radius:/, level); }
        for (const path of fixture.trajectories.filter((item: { id: string }) => !["reverse-join", "pixelate-slopes"].includes(item.id))) {
          await button("Select").scrollIntoViewIfNeeded(); await settle(page);
          const offset = path.id === "boundary-zigzag" ? 0 : 50;
          const before = await snapshot(page), first = await point(path.points[0].x + offset, path.points[0].y + offset);
          await page.mouse.move(first.x, first.y); await page.mouse.down();
          for (const p of path.points.slice(1)) { const q = await point(p.x + offset, p.y + offset); await page.mouse.move(q.x, q.y); }
          const preview = await snapshot(page); await page.mouse.up(); await settle(page); const after = await snapshot(page);
          const operation: BrowserRunMetrics["operations"][number] = { id: `matrix/${tool}/${level}/${path.id}`, tool, level, trajectory: path.id, before, preview, after };
          operations.push(operation);
          assert.equal(after.pixels, preview.pixels, `${tool}/${level}/${path.id}: preview/release pixels`);
          assert.equal(after.coveragePixels, preview.coveragePixels, `${tool}/${level}/${path.id}: preview/release companion`);
          assert.equal(after.protected, before.protected, `${tool}/${level}/${path.id}: protected metadata`);
          if (path.id === "tight-s" && level === 50) await capture(page, `${output}/${tool}-smoothing-50.png`);
          if (level === 0) { assert.equal(after.authored, before.authored); assert.equal(after.historyLength, before.historyLength); }
          else {
            assert.equal(after.historyPosition, before.historyPosition + 1, `${tool}/${level}/${path.id}: one applied history entry`);
            operation.redoDisabled = await button("Redo").isDisabled(); assert.equal(operation.redoDisabled, true, `${tool}/${level}/${path.id}: new edit clears Redo`);
            await button("Undo").click(); await settle(page); const undone = await snapshot(page); assert.equal(undone.authored, before.authored); assert.equal(undone.pixels, before.pixels);
            await button("Redo").click(); await settle(page); const redone = await snapshot(page); assert.equal(redone.authored, after.authored); assert.equal(redone.pixels, after.pixels);
            operation.undone = undone; operation.redone = redone;
            await button("Undo").click(); await settle(page);
          }
          recordCase(operation);
        }
        console.log(JSON.stringify({ matrix: tool, level, operations: operations.length }));
      }
    }
    return;
  }
  if (process.argv.includes("--performance")) {
    // Two distinct raster frames, authored through the same native controls as
    // the correctness fixture. Timing excludes fixture construction/digests.
    await stroke([180, 180], [550, 300]);
    const cells = page.locator("button[data-timeline-cell]"); await cells.first().click({ button: "right" }); await button("Insert Blank Keyframe").click(); await settle(page);
    await stroke([800, 300], [1100, 500]); await page.locator('button[data-timeline-cell][data-frame-index="0"]').last().click(); await settle(page);
    const representative = await snapshot(page); assert.equal(representative.inventory.rasterCells, 2);
    const saveSamplesMs: number[] = [], openSamplesMs: number[] = [];
    for (let i = 0; i < 3; i++) {
      const saveStart = performance.now(); await button("File").click(); await page.getByRole("menuitem", { name: "Save", exact: true }).click();
      await page.getByRole("status").filter({ hasText: "Saved on this browser" }).waitFor(); await settle(page); saveSamplesMs.push(performance.now() - saveStart);
      await page.goto(url); await page.getByRole("button", { name: /^Open Project/ }).click(); const openStart = performance.now();
      await button("Open Untitled Project").click(); await page.waitForFunction(() => {
        const canvas = document.querySelector('canvas[data-workspace-canvas="editable"]');
        return canvas && (window as unknown as { __phase1: { coverage: WeakMap<object, { tiles: unknown[] }> } }).__phase1.coverage.get(canvas)?.tiles.length;
      }); await settle(page); openSamplesMs.push(performance.now() - openStart);
      assert.equal((await snapshot(page)).authored, representative.authored);
    }
    recordCase({ id: "representative-two-raster-open-save", representative, saveSamplesMs, openSamplesMs, completed: true });
    const cdp = await context.newCDPSession(page);
    const heap = async (settled: boolean) => { if (settled) await cdp.send("HeapProfiler.collectGarbage"); const sample = await cdp.send("Runtime.getHeapUsage"); return { ...sample, countedBytes: sample.usedSize + (sample.backingStorageSize ?? 0) }; };
    const settledHeaps = [await heap(true)], transientHeaps: Awaited<ReturnType<typeof heap>>[] = [];
    const scratch = () => page.evaluate(() => {
      const canvas = document.querySelector('canvas[data-workspace-canvas="editable"]')!;
      type Fiber = { return: Fiber | null; memoizedState?: { memoizedState: unknown; next: Fiber["memoizedState"] } };
      let fiber = (canvas as unknown as Record<string, Fiber>)[Object.keys(canvas).find(key => key.startsWith("__reactFiber$"))!];
      let drafts = 0, preparedCommands = 0, scratchBytes = 0, maximumAllocationBytes = 0;
      const seen = new Set<object>();
      const inspect = (value: unknown, transient = false) => {
        if (!value || typeof value !== "object" || seen.has(value)) return; seen.add(value);
        if (ArrayBuffer.isView(value)) { maximumAllocationBytes = Math.max(maximumAllocationBytes, value.byteLength); if (transient) scratchBytes += value.byteLength; return; }
        if (value instanceof ImageData) { maximumAllocationBytes = Math.max(maximumAllocationBytes, value.data.byteLength); if (transient) scratchBytes += value.data.byteLength; return; }
        if (value instanceof HTMLCanvasElement || value instanceof Node) return;
        if (value instanceof Map) { for (const item of value.values()) inspect(item, transient); return; }
        if ("engine" in value && "writer" in value && "tiles" in value) { drafts++; transient = true; }
        if ("commandId" in value && value.commandId === "drawing.raster-gesture.commit/v2") { preparedCommands++; transient = true; }
        for (const item of Object.values(value)) inspect(item, transient);
      };
      while (fiber) { let hook = fiber.memoizedState; while (hook) { const state = hook.memoizedState; if (state && typeof state === "object" && "current" in state) inspect(state.current); hook = hook.next; } fiber = fiber.return!; }
      return { drafts, preparedCommands, scratchBytes, maximumAllocationBytes };
    });
    const scratchBaseline = await scratch(); assert.equal(scratchBaseline.drafts, 0); assert.equal(scratchBaseline.preparedCommands, 0);
    await page.evaluate(() => {
      const root = window as unknown as { __timing: { samples: number[]; frames: number[]; interval: number[]; release: number[]; longTasks: number[][]; memory: number[] } };
      root.__timing = { samples: [], frames: [], interval: [], release: [], longTasks: [], memory: [] };
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) root.__timing.longTasks.push([entry.startTime, entry.duration]);
      }).observe({ type: "longtask" });
      const starts = new WeakMap<Event, number>();
      window.addEventListener("pointerdown", event => { if (event.target instanceof HTMLCanvasElement) root.__timing.interval[0] = performance.now(); }, true);
      window.addEventListener("pointerup", () => { root.__timing.release[0] = performance.now(); }, true);
      window.addEventListener("pointerup", () => { root.__timing.release[1] = performance.now(); root.__timing.interval[1] = performance.now(); });
      window.addEventListener("pointermove", event => {
        if (!(event.buttons & 1) || !(event.target instanceof HTMLCanvasElement)) return;
        const start = performance.now();
        starts.set(event, start);
        requestAnimationFrame(() => root.__timing.frames.push(performance.now() - start));
      }, true);
      window.addEventListener("pointermove", event => {
        const start = starts.get(event); if (start === undefined) return;
        const end = performance.now(); root.__timing.samples.push(end - start);
        const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
        if (memory) root.__timing.memory.push(memory.usedJSHeapSize);
      });
    });
    const metrics: unknown[] = [];
    for (const tool of ["Brush", "Pencil", "Sketch", "Pixelate", "Glow"]) {
      await variant(tool); await setRange(/size:/, 12); await setRange(/^Smoothing:/, 50); await setRange(/^Transparency:/, 50);
      if (tool === "Glow") { await setRange(/^Gradient Brightness:/, 100); await setRange(/^Gradient Radius:/, 50); }
      await button("Select").scrollIntoViewIfNeeded(); await settle(page);
      const inputs = await page.locator('input[type="range"]').evaluateAll(elements => elements.map(element => ({ label: element.getAttribute("aria-label"), min: element.getAttribute("min"), max: element.getAttribute("max"), value: (element as HTMLInputElement).value })));
      const a = await point(200, 500), b = await point(800, 660);
      const runs: Array<{ samples: number[]; frames: number[]; interval: number[]; release: number[]; longTasks: number[][]; memory: number[] }> = [];
      for (let i = 0; i < 23; i++) {
        await page.evaluate(() => { const t = (window as unknown as { __timing: { samples: number[]; frames: number[]; interval: number[]; release: number[]; longTasks: number[][]; memory: number[] } }).__timing; t.samples = []; t.frames = []; t.interval = []; t.release = []; t.longTasks = []; t.memory = []; });
        await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 16 }); await page.mouse.up(); await settle(page);
        // Observe deferred no-op work before another user action can begin.
        await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 250)));
        const run = await page.evaluate(() => structuredClone((window as unknown as { __timing: { samples: number[]; frames: number[]; interval: number[]; release: number[]; longTasks: number[][]; memory: number[] } }).__timing));
        assert.ok(run.samples.length >= 16 && run.interval.length === 2 && run.release.length === 2); runs.push(run);
        if (i === 22) transientHeaps.push(await heap(false));
        await button("Undo").click(); await settle(page);
      }
      const measured = runs.slice(3), previewSamplesMs = measured.map(run => Math.max(...run.samples));
      const pointerActiveLongTasksMs = measured.flatMap(run => run.longTasks.filter(([start, duration]) => start < run.interval[1] && start + duration > run.interval[0]).map(([, duration]) => duration));
      const postReleaseNoopSamplesMs = measured.map(run => Math.max(0, ...run.longTasks.filter(([start]) => start >= run.interval[1]).map(([, duration]) => duration)));
      const result = { variant: tool, inputs, warmups: runs.slice(0, 3), runs: measured, previewSamplesMs, pointerActiveLongTasksMs, postReleaseNoopSamplesMs };
      metrics.push(result); recordCase({ id: `preview/${tool}`, ...result, completed: true });
      console.log(JSON.stringify({ variant: tool, previewP95: [...previewSamplesMs].sort((a, b) => a - b)[18], pointerActiveLongTasksMs, releaseHandlerMaximum: Math.max(...measured.map(run => run.release[1] - run.release[0])) }));
      settledHeaps.push(await heap(true));
    }
    const scratchAfter = await scratch(); assert.equal(scratchAfter.drafts, 0); assert.equal(scratchAfter.preparedCommands, 0); assert.equal(scratchAfter.scratchBytes, scratchBaseline.scratchBytes);
    assert.equal((await snapshot(page)).authored, representative.authored);
    recordCase({ id: "scratch-heap-allocation-release", profile, metrics, drawUndoCycles: 115, scratchBaseline, scratchAfter, settledHeaps, transientHeaps, completed: true });
    await capture(page, `${output}/performance-complete.png`);
    return;
  }
  const before = await snapshot(page);
  const first = await stroke([180, 180], [550, 300]);
  operations.push({ id: "first-stroke-diagnostic", before, ...first });
  await capture(page, `${output}/first-stroke.png`);
  if (process.argv.includes("--diagnose-dev")) {
    console.log(JSON.stringify({ consoleMessages, errors }));
    throw new Error("diagnostic-stop-after-first-stroke");
  }
  console.log(JSON.stringify({ before: { count: before.count, history: before.historyLength }, preview: { count: first.preview.count }, after: { count: first.after.count, history: first.after.historyLength }, errors }));
  assert.equal(first.preview.pixels, first.after.pixels, "release pixel identity");
  assert.equal(first.after.historyLength, before.historyLength + 1, "one history entry");
  await button("Undo").click(); await settle(page); const undo = await snapshot(page);
  assert.equal(undo.authored, before.authored, "exact authored Undo"); assert.equal(undo.pixels, before.pixels, "exact visible Undo");
  await button("Redo").click(); await settle(page); const redo = await snapshot(page);
  assert.equal(redo.authored, first.after.authored, "exact authored Redo"); assert.equal(redo.pixels, first.after.pixels, "exact visible Redo");
  recordCase({ id: "brush-preview-release-undo-redo", before, ...first, undo, redo });
  const a = await point(200, 350), b = await point(500, 420);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.keyboard.press("Escape"); await page.mouse.up(); await settle(page);
  const canceled = await snapshot(page); assert.equal(canceled.authored, redo.authored, "cancel authored equality"); assert.equal(canceled.pixels, redo.pixels, "cancel visible equality"); assert.equal(canceled.historyLength, redo.historyLength, "cancel zero history");
  recordCase({ id: "escape-cancel", before: redo, after: canceled });
  await button("Undo").click(); await settle(page);
  await setRange(/^Transparency:/, 90);
  const ten = await stroke([180, 180], [550, 300]);
  assert.equal(ten.after.maximumAlpha, 26, "10% alpha exactly 26");
  const repeat = await stroke([180, 180], [550, 300]);
  assert.equal(repeat.after.maximumAlpha, 26, "10% repeat never accumulates");
  assert.equal(repeat.after.pixels, ten.after.pixels, "identical repeat pixels");
  assert.deepEqual(repeat.after.coverage, ten.after.coverage, "identical repeat coverage");
  assert.equal(repeat.after.historyLength, ten.after.historyLength, "fully covered repeat is a history no-op");
  recordCase({ id: "ten-percent-repeat", ten: ten.after, repeat: repeat.after });
  await button("Select").click();
  const selectA = await point(130, 130), selectB = await point(620, 370);
  await page.mouse.move(selectA.x, selectA.y); await page.mouse.down(); await page.mouse.move(selectB.x, selectB.y, { steps: 12 }); await page.mouse.up(); await settle(page);
  await button("Brush").click(); await settle(page);
  const afterSelect = await snapshot(page);
  assert.equal(afterSelect.pixels, repeat.after.pixels, "selection release retains pixels");
  assert.deepEqual(afterSelect.coverage, repeat.after.coverage, "selection release retains coverage");
  recordCase({ id: "box-selection-retention", before: repeat.after, after: afterSelect });
  await button("File").click(); await page.getByRole("menuitem", { name: "Save", exact: true }).click();
  const saveDialog = page.getByRole("dialog");
  if (await saveDialog.count()) {
    await saveDialog.getByRole("textbox").fill("Phase 1 disposable proof");
    await saveDialog.getByRole("button", { name: "Save", exact: true }).click();
  }
  await page.getByRole("status").filter({ hasText: "Saved on this browser" }).waitFor();
  await settle(page);
  const saved = await snapshot(page);
  assert.equal(saved.pixels, afterSelect.pixels, "Save preserves visible pixels");
  assert.deepEqual(saved.coverage, afterSelect.coverage, "Save preserves coverage");
  recordCase({ id: "save-retention", before: afterSelect, after: saved });
  const openTitle = async (title: string) => {
    await page.reload(); await page.getByRole("button", { name: /^Open Project/ }).click();
    await page.getByRole("button", { name: `Open ${title}`, exact: true }).click();
    await button("File").waitFor();
    await page.waitForFunction(() => {
      const canvas = document.querySelector('canvas[data-workspace-canvas="editable"]');
      return canvas && (window as unknown as { __phase1: { coverage: WeakMap<object, { tiles?: unknown[] }> } }).__phase1.coverage.get(canvas)?.tiles?.length;
    });
    await settle(page); return snapshot(page);
  };
  const reopened = await openTitle("Untitled Project");
  assert.equal(reopened.pixels, saved.pixels, "Open exact pixel digest");
  assert.deepEqual(reopened.coverage, saved.coverage, "Open exact coverage digest");
  await button("Brush").click(); await setRange(/^Transparency:/, 90);
  const afterOpenRepeat = await stroke([180, 180], [550, 300]);
  assert.equal(afterOpenRepeat.after.pixels, reopened.pixels, "same paint after Open remains exact");
  assert.deepEqual(afterOpenRepeat.after.coverage, reopened.coverage, "same paint after Open retains companion");
  recordCase({ id: "reload-open-repeat", before: saved, reopened, after: afterOpenRepeat.after });
  expectedSaveAsName = "Phase 1 copy";
  await button("File").click(); await page.getByRole("menuitem", { name: "Save As", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Saved on this browser" }).waitFor();
  await page.getByText("Phase 1 copy", { exact: true }).first().waitFor(); await settle(page);
  const copyOpened = await openTitle("Phase 1 copy");
  assert.equal(copyOpened.pixels, saved.pixels, "Save As copy pixels"); assert.deepEqual(copyOpened.coverage, saved.coverage, "Save As copy companion");
  const originalOpened = await openTitle("Untitled Project");
  assert.equal(originalOpened.pixels, saved.pixels, "original remains exact after Save As"); assert.deepEqual(originalOpened.coverage, saved.coverage, "original companion after Save As");
  recordCase({ id: "save-as-original-copy", saved, copyOpened, originalOpened });
  for (const tool of ["Brush", "Pencil", "Sketch", "Pixelate", "Glow"]) for (const opacity of [10, 50]) {
    await page.goto(url); await page.getByRole("button", { name: /^New Project/ }).click(); await settle(page);
    await variant(tool); await setRange(/size:/, 12); await setRange(/^Smoothing:/, 50); await setRange(/^Transparency:/, 100 - opacity);
    if (tool === "Glow") { await setRange(/^Gradient Brightness:/, 100); await setRange(/^Gradient Radius:/, 50); }
    const before = await snapshot(page), first = await stroke([220, 300], [820, 360]);
    assert.equal(first.after.pixels, first.preview.pixels); assert.equal(first.after.coveragePixels, first.preview.coveragePixels);
    const repeated = await stroke([220, 300], [820, 360]);
    assert.equal(repeated.after.pixels, repeated.preview.pixels); assert.equal(repeated.after.coveragePixels, repeated.preview.coveragePixels);
    assert.equal(repeated.after.pixels, first.after.pixels); assert.equal(repeated.after.coveragePixels, first.after.coveragePixels); assert.equal(repeated.after.historyPosition, first.after.historyPosition);
    const offset = await stroke([220, 305], [820, 365]);
    const ceiling = Math.round(255 * opacity / 100);
    assert.ok(first.after.count > 0 && offset.after.count > first.after.count); assert.ok(first.after.maximumAlpha <= ceiling && offset.after.maximumAlpha <= ceiling);
    assert.equal(offset.after.pixels, offset.preview.pixels); assert.equal(offset.after.coveragePixels, offset.preview.coveragePixels);
    await button("Undo").click(); await settle(page); const undone = await snapshot(page); assert.equal(undone.authored, first.after.authored); assert.equal(undone.coveragePixels, first.after.coveragePixels);
    await button("Redo").click(); await settle(page); const redone = await snapshot(page); assert.equal(redone.authored, offset.after.authored); assert.equal(redone.coveragePixels, offset.after.coveragePixels);
    const title = `Same paint ${tool} ${opacity}`; expectedSaveAsName = title;
    await button("File").click(); await page.getByRole("menuitem", { name: "Save As", exact: true }).click(); await page.getByRole("status").filter({ hasText: "Saved on this browser" }).waitFor();
    const opened = await openTitle(title); assert.equal(opened.centeredPixels, offset.after.centeredPixels); assert.equal(opened.centeredCoveragePixels, offset.after.centeredCoveragePixels);
    await variant(tool); await setRange(/size:/, 12); await setRange(/^Smoothing:/, 50); await setRange(/^Transparency:/, 100 - opacity);
    if (tool === "Glow") { await setRange(/^Gradient Brightness:/, 100); await setRange(/^Gradient Radius:/, 50); }
    const afterOpen = await stroke([220, 300], [820, 360]); assert.equal(afterOpen.after.pixels, opened.pixels); assert.equal(afterOpen.after.coveragePixels, opened.coveragePixels);
    assert.equal(afterOpen.after.pixels, afterOpen.preview.pixels); assert.equal(afterOpen.after.coveragePixels, afterOpen.preview.coveragePixels);
    recordCase({ id: `same-paint/${tool}/${opacity}`, tool, opacity, ceiling, before, first, repeated, offset, undone, redone, opened, afterOpen });
  }
  await page.goto(url); await page.getByRole("button", { name: /^New Project/ }).click(); await settle(page);
  await variant("Brush"); await setRange(/size:/, 12); await setRange(/^Smoothing:/, 0); await setRange(/^Transparency:/, 0);
  const setColor = async (color: string) => {
    await page.getByLabel("Brush color").evaluate((element, value) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); element.dispatchEvent(new Event("change", { bubbles: true }));
    }, color); await settle(page);
  };
  const paintWitness = async () => {
    const screen = await point(500, 330);
    return page.locator('canvas[data-workspace-canvas="editable"]').evaluate((element, screen) => {
      const canvas = element as HTMLCanvasElement, rect = canvas.getBoundingClientRect();
      const x = Math.floor((screen.x - rect.x) * canvas.width / rect.width), y = Math.floor((screen.y - rect.y) * canvas.height / rect.height);
      type Coverage = { tiles: Array<{ x: number; y: number; palette: unknown[]; runs: Uint8Array }> };
      const coverage = (window as unknown as { __phase1: { coverage: WeakMap<object, Coverage> } }).__phase1.coverage.get(canvas)!;
      const tile = coverage.tiles.find(tile => x >= tile.x && y >= tile.y && x < tile.x + 32 && y < tile.y + 32)!;
      const point = (y - tile.y) * 32 + x - tile.x, u16 = (offset: number) => tile.runs[offset] | tile.runs[offset + 1] << 8;
      let pixel: unknown = null;
      for (let offset = 0; offset < tile.runs.length; offset += 14) if (point >= u16(offset) && point < u16(offset) + u16(offset + 2)) {
        pixel = { key: tile.palette[u16(offset + 4)], base: Array.from(tile.runs.slice(offset + 6, offset + 10)), coverage: tile.runs[offset + 10], pigment: Array.from(tile.runs.slice(offset + 11, offset + 14)) }; break;
      }
      return { rgba: Array.from(canvas.getContext("2d")!.getImageData(x, y, 1, 1).data), pixel };
    }, screen);
  };
  await setColor("#123456"); await stroke([220, 330], [820, 330]); let previousWitness = await paintWitness();
  const changes: unknown[] = [];
  for (const change of [{ tool: "Brush", color: "#c04080", opacity: 50 }, { tool: "Brush", color: "#c04080", opacity: 10 }, { tool: "Pencil", color: "#c04080", opacity: 10 }]) {
    await variant(change.tool); await setRange(/size:/, 12); await setRange(/^Smoothing:/, 0); await setRange(/^Transparency:/, 100 - change.opacity); await setColor(change.color);
    const before = await snapshot(page), painted = await stroke([220, 330], [820, 330]), witness = await paintWitness();
    const pixel = witness.pixel as { key: { variant: string; color: string; opacityByte: number }; base: number[] };
    assert.ok(pixel); assert.deepEqual(pixel.base, previousWitness.rgba); assert.deepEqual(pixel.key, { variant: change.tool, color: change.color, opacityByte: Math.round(255 * change.opacity / 100) });
    assert.equal(painted.after.pixels, painted.preview.pixels); assert.equal(painted.after.coveragePixels, painted.preview.coveragePixels);
    await button("Undo").click(); await settle(page); const undone = await snapshot(page); assert.equal(undone.authored, before.authored);
    await button("Redo").click(); await settle(page); const redone = await snapshot(page); assert.equal(redone.authored, painted.after.authored);
    changes.push({ change, before, painted, previousWitness, witness, undone, redone }); previousWitness = witness;
  }
  assert.equal(changes.length, 3); recordCase({ id: "different-color-opacity-variant", changes });
  await capture(page, `${output}/initial-${profile.width}.png`);
  console.log(JSON.stringify({ status: "PARTIAL", profile, operations: operations.map(v => (v as { id: string }).id), errors }));
  assert.deepEqual(errors, []);
  assert.deepEqual(consoleMessages.filter(message => message.type === "error"), [], "zero console errors");
};
try {
  await run();
  assert.equal(createHash("sha256").update(readFileSync("scripts/spec0007-manual/phase-1/browserProof.ts")).digest("hex"), producerSha256, "browser producer unchanged during execution");
  assert.deepEqual(errors, [], "zero uncaught browser errors");
  assert.deepEqual(consoleMessages.filter(message => message.type === "error"), [], "zero browser console errors");
} catch (error) {
  errors.push(error instanceof Error ? error.stack! : String(error)); process.exitCode = 1;
  console.error(errors.at(-1));
} finally {
  const failurePage = activePage as Page | null;
  if (failurePage && errors.length) {
    await capture(failurePage, `${output}/failure.png`);
    writeFileSync(`${output}/failure-visible.txt`, await failurePage.locator("body").innerText());
  }
  await Promise.all(responseReads);
  const sourceDigestAfter = currentSourceDigest();
  const buildStamp = existsSync(BUILD_STAMP_PATH) ? bind(BUILD_STAMP_PATH) : null;
  const buildCurrent = buildStamp && JSON.parse(readFileSync(BUILD_STAMP_PATH, "utf8")).sourceDigest === sourceDigestBefore;
  const complete = JSON.stringify(completedCases.map(value => value.id).sort()) === JSON.stringify(EXPECTED_BROWSER_CASES[mode].slice().sort());
  const profile = process.argv.includes("--compact") ? { id: "compact" as const, width: 390, height: 844, deviceScaleFactor: 2 } : { id: "desktop" as const, width: 1440, height: 900, deviceScaleFactor: 1 };
  const metrics: BrowserRunMetrics = { profile, mode, url, browserVersion: browser.version(), operations, requests, errors, consoleMessages, sourceStoreWrites, screenshots, buildStamp, servedAssets: [...servedAssets.values()] };
  const result: ProducerResult = { kind: "phase1-producer-result", version: 1, commandId: `browser-${profile.id}-${mode}`,
    execution: errors.length ? "FAILED" : complete && buildCurrent && sourceDigestBefore === sourceDigestAfter ? "COMPLETE" : "INCOMPLETE",
    sourceDigestBefore, sourceDigestAfter, producerSha256, fixtureSha256: bind(FIXTURE_PATH).sha256, completedCases, failures: errors, metrics };
  writeFileSync(`${output}/initial.json`, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({ execution: result.execution, result: bind(`${output}/initial.json`) }));
  if (errors.length) process.exitCode = 1;
  await browser.close();
}
