import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium, type BrowserContext, type Locator, type Page } from "playwright-core";
import { currentSourceDigest } from "./proofContract.ts";

type StrengthFixtureCase = {
  id: string;
  points?: Array<[number, number]>;
  generatedCircle?: { centerX: number; centerY: number; radius: number; samples: number };
  expectedOutput: Array<[number, number]>;
};
const strengthFixture = JSON.parse(readFileSync(
  "scripts/fixtures/spec0007-manual/phase-2/contract.json",
  "utf8",
)) as { strengthCases: StrengthFixtureCase[] };
const strengthCase = (id: string) => {
  const fixtureCase = strengthFixture.strengthCases.find(value => value.id === id);
  if (!fixtureCase) throw new Error(`missing_strength_case:${id}`);
  const points = fixtureCase.points ?? Array.from({ length: fixtureCase.generatedCircle!.samples + 1 }, (_, index) => {
    const circle = fixtureCase.generatedCircle!;
    const angle = index * Math.PI * 2 / circle.samples;
    return [
      Math.round((circle.centerX + circle.radius * Math.cos(angle)) * 1000) / 1000,
      Math.round((circle.centerY + circle.radius * Math.sin(angle)) * 1000) / 1000,
    ] as [number, number];
  });
  return { ...fixtureCase, points };
};

const url = process.argv.find(argument => argument.startsWith("--url="))?.slice(6) ?? "http://127.0.0.1:56877/";
assert.match(url, /^http:\/\/127\.0\.0\.1:[0-9]+\/$/);
const outputRoot = "output/spec-0007/phase-2/browser";
mkdirSync(outputRoot, { recursive: true });
const sourceDigestBefore = currentSourceDigest();
let assertions = 0;
const check = (value: unknown, label: string) => {
  assertions += 1;
  assert.ok(value, label);
};
const equal = (actual: unknown, expected: unknown, label: string) => {
  assertions += 1;
  assert.deepEqual(actual, expected, label);
};

type CanvasSnapshot = {
  digest: string;
  pixels: number;
  maximumAlpha: number;
  bounds: { left: number; top: number; right: number; bottom: number } | null;
  width: number;
  height: number;
};

const settle = (page: Page) => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
const clickWithoutPointerRelease = (target: Locator) => target.evaluate(element => {
  const bounds = element.getBoundingClientRect();
  element.dispatchEvent(new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    clientX: bounds.left + bounds.width / 2,
    clientY: bounds.top + bounds.height / 2,
  }));
});
const canvasSnapshot = (page: Page): Promise<CanvasSnapshot> => page.locator('canvas[data-workspace-canvas="editable"]').evaluate(async canvasElement => {
  const canvas = canvasElement as HTMLCanvasElement;
  const bytes = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
  const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource))]
    .map(value => value.toString(16).padStart(2, "0")).join("");
  let pixels = 0;
  let maximumAlpha = 0;
  let left = canvas.width;
  let top = canvas.height;
  let right = -1;
  let bottom = -1;
  for (let offset = 3; offset < bytes.length; offset += 4) {
    const alpha = bytes[offset];
    if (!alpha) continue;
    const index = (offset - 3) / 4;
    const x = index % canvas.width;
    const y = Math.floor(index / canvas.width);
    pixels += 1;
    maximumAlpha = Math.max(maximumAlpha, alpha);
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }
  return { digest, pixels, maximumAlpha, bounds: pixels ? { left, top, right, bottom } : null, width: canvas.width, height: canvas.height };
});
const regionDigest = (page: Page, region: { left: number; top: number; right: number; bottom: number }) => page.locator('canvas[data-workspace-canvas="editable"]').evaluate(async (canvasElement, cssRegion) => {
  const canvas = canvasElement as HTMLCanvasElement;
  const bounds = canvas.getBoundingClientRect();
  const left = Math.max(0, Math.floor((cssRegion.left - bounds.left) * canvas.width / bounds.width));
  const top = Math.max(0, Math.floor((cssRegion.top - bounds.top) * canvas.height / bounds.height));
  const right = Math.min(canvas.width, Math.ceil((cssRegion.right - bounds.left) * canvas.width / bounds.width));
  const bottom = Math.min(canvas.height, Math.ceil((cssRegion.bottom - bounds.top) * canvas.height / bounds.height));
  const bytes = canvas.getContext("2d")!.getImageData(left, top, Math.max(1, right - left), Math.max(1, bottom - top)).data;
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource))]
    .map(value => value.toString(16).padStart(2, "0")).join("");
}, region);

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--disable-background-networking", "--disable-component-update", "--disable-sync", "--disable-extensions", "--no-first-run", "--enable-precise-memory-info", "--js-flags=--expose-gc"],
});
const errors: string[] = [];
const prepareContext = async (viewport: { width: number; height: number }): Promise<{ context: BrowserContext; page: Page }> => {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(() => {
    if (location.hostname === "127.0.0.1") localStorage.setItem("da_welcome_seen", "1");
  });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(`page:${error.message}`));
  page.on("console", message => { if (message.type() === "error") errors.push(`console:${message.text()}`); });
  await page.goto(url);
  await page.getByRole("button", { name: /^New Project/ }).evaluate(element => (element as HTMLButtonElement).click());
  await page.locator('canvas[data-workspace-canvas="editable"]').waitFor();
  await page.getByRole("button", { name: "Brush", exact: true }).click();
  await page.getByRole("button", { name: "Properties", exact: true }).click();
  await settle(page);
  return { context, page };
};
const setRange = async (page: Page, label: RegExp, value: number) => {
  const input = page.getByLabel(label);
  await input.evaluate((element, next) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, String(next));
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
  await settle(page);
  equal(await input.inputValue(), String(value), `${label}: range value ${value}`);
};
const setVariant = async (page: Page, variant: string) => {
  await page.getByRole("button", { name: "Brush", exact: true }).click();
  await page.getByRole("button", { name: "Properties", exact: true }).click();
  await page.getByRole("button", { name: /^Brush Tools:/ }).click();
  await page.getByRole("button", { name: variant, exact: true }).filter({ hasText: new RegExp(`^${variant}$`) }).click();
  await page.getByRole("button", { name: `Brush Tools: ${variant}`, exact: true }).waitFor();
  await settle(page);
};
const worldPoint = (page: Page, x: number, y: number) => page.locator('svg[aria-label="Editable stick figure content"]').evaluate((svg, value) => {
  const point = new DOMPoint(value.x, value.y).matrixTransform((svg as SVGGraphicsElement).getScreenCTM()!);
  return { x: point.x, y: point.y };
}, { x, y });
const drawPath = async (page: Page, path: Array<[number, number]>, steps = 1, release = true) => {
  const screen = await Promise.all(path.map(([x, y]) => worldPoint(page, x, y)));
  await page.mouse.move(screen[0].x, screen[0].y);
  await page.mouse.down();
  for (const next of screen.slice(1)) await page.mouse.move(next.x, next.y, { steps });
  await settle(page);
  const preview = await canvasSnapshot(page);
  if (release) {
    await page.mouse.up();
    await settle(page);
  }
  return { screen, preview, after: release ? await canvasSnapshot(page) : null };
};

const desktop = await prepareContext({ width: 1200, height: 760 });
const page = desktop.page;
const drawRig = page.getByRole("switch", { name: "Draw Rig" });
equal(await drawRig.getAttribute("aria-checked"), "false", "Draw Rig defaults OFF");
await drawRig.click();
equal(await drawRig.getAttribute("aria-checked"), "true", "Draw Rig toggles ON");
const empty = await canvasSnapshot(page);

const corePoints: Array<[number, number]> = [[180, 180], [260, 181], [350, 179], [440, 180], [442, 245]];
const coreScreen = await Promise.all(corePoints.map(([x, y]) => worldPoint(page, x, y)));
await page.mouse.move(coreScreen[0].x, coreScreen[0].y);
await page.mouse.down();
for (const next of coreScreen.slice(1, 4)) await page.mouse.move(next.x, next.y);
await settle(page);
const straightPreview = await canvasSnapshot(page);
check(straightPreview.pixels > 0 && straightPreview.bounds && straightPreview.bounds.right - straightPreview.bounds.left > 100, "small wobble is visible immediately as a long straight-ish run");
await page.screenshot({ path: `${outputRoot}/desktop-live-straight.png` });
await page.mouse.move(coreScreen[4].x, coreScreen[4].y);
await settle(page);
const firstBend = await canvasSnapshot(page);
check(firstBend.bounds && straightPreview.bounds && firstBend.bounds.bottom > straightPreview.bounds.bottom, "corridor departure produces an immediate bend");
const lockedRegion = { left: coreScreen[0].x - 8, top: coreScreen[0].y - 15, right: coreScreen[3].x - 25, bottom: coreScreen[0].y + 15 };
const lockedDigest = await regionDigest(page, lockedRegion);
await page.screenshot({ path: `${outputRoot}/desktop-live-first-bend.png` });
const remaining = await Promise.all(([[442, 330], [560, 330]] as Array<[number, number]>).map(([x, y]) => worldPoint(page, x, y)));
for (const next of remaining) await page.mouse.move(next.x, next.y);
await settle(page);
const completePreview = await canvasSnapshot(page);
equal(await regionDigest(page, lockedRegion), lockedDigest, "locked prefix pixels remain immutable while the live tail advances");
for (let index = 0; index < 4; index += 1) await settle(page);
equal((await canvasSnapshot(page)).digest, completePreview.digest, "stationary pointer causes no delayed refit");
await page.screenshot({ path: `${outputRoot}/desktop-live-second-bend.png` });
await page.mouse.up();
await settle(page);
const released = await canvasSnapshot(page);
equal(released.digest, completePreview.digest, "pointer release exactly matches the last live preview");
check(!(await page.getByRole("button", { name: "Undo", exact: true }).isDisabled()), "release creates an undoable history entry");
await page.getByRole("button", { name: "Undo", exact: true }).click();
await settle(page);
equal((await canvasSnapshot(page)).digest, empty.digest, "Undo restores the exact pre-stroke raster");
await page.getByRole("button", { name: "Redo", exact: true }).click();
await settle(page);
equal((await canvasSnapshot(page)).digest, released.digest, "Redo restores the exact Draw Rig raster");
await page.getByRole("button", { name: "Undo", exact: true }).click();
await settle(page);

const fast = await drawPath(page, [[180, 180], [560, 180]], 1);
equal(fast.preview.digest, fast.after!.digest, "fast release matches preview");
await page.getByRole("button", { name: "Undo", exact: true }).click(); await settle(page);
const slow = await drawPath(page, [[180, 180], [560, 180]], 40);
equal(slow.preview.digest, slow.after!.digest, "slow release matches preview");
equal(slow.after!.digest, fast.after!.digest, "fast and slow straight runs are pixel-identical");
await page.getByRole("button", { name: "Undo", exact: true }).click(); await settle(page);

const smoothingPath: Array<[number, number]> = [[180, 180], [390, 180], [390, 320], [560, 320]];
await setRange(page, /^Smoothing:/, 0);
const smoothingZero = await drawPath(page, smoothingPath, 5);
await page.getByRole("button", { name: "Undo", exact: true }).click(); await settle(page);
await setRange(page, /^Smoothing:/, 100);
const smoothingHundred = await drawPath(page, smoothingPath, 5);
equal(smoothingHundred.after!.digest, smoothingZero.after!.digest, "Draw Rig pixels are exactly smoothing-independent");
await page.getByRole("button", { name: "Undo", exact: true }).click(); await settle(page);

const cancelBefore = await canvasSnapshot(page);
const cancelStart = await worldPoint(page, 180, 180);
const cancelEnd = await worldPoint(page, 520, 260);
await page.mouse.move(cancelStart.x, cancelStart.y); await page.mouse.down(); await page.mouse.move(cancelEnd.x, cancelEnd.y, { steps: 8 }); await settle(page);
check((await canvasSnapshot(page)).digest !== cancelBefore.digest, "in-progress Draw Rig preview is visible");
await page.keyboard.press("Escape"); await page.mouse.up(); await settle(page);
equal((await canvasSnapshot(page)).digest, cancelBefore.digest, "Escape cancels the complete in-progress preview");
await page.getByRole("button", { name: "Select", exact: true }).click();
await page.getByRole("button", { name: "Brush", exact: true }).click();
await page.getByRole("button", { name: "Properties", exact: true }).click();
equal(await page.getByRole("switch", { name: "Draw Rig" }).getAttribute("aria-checked"), "true", "tool transition preserves the session toggle without persisting document data");

await setVariant(page, "Brush");
await setRange(page, /^Transparency:/, 0);
await setRange(page, /^Smoothing:/, 50);
const strengthScale = await page.locator('svg[aria-label="Editable stick figure content"]').evaluate(svg => {
  const matrix = (svg as SVGGraphicsElement).getScreenCTM()!;
  const cameraZoom = 0.85;
  return {
    x: cameraZoom / Math.hypot(matrix.a, matrix.b),
    y: cameraZoom / Math.hypot(matrix.c, matrix.d),
  };
});
const translate = (points: Array<[number, number]>, x: number, y: number): Array<[number, number]> => points.map(([pointX, pointY]) => [
  pointX * strengthScale.x + x,
  pointY * strengthScale.y + y,
]);
const compareStrengthRaster = async (id: string, offsetX: number, offsetY: number, screenshot?: string, exact = true) => {
  const fixtureCase = strengthCase(id);
  const before = await canvasSnapshot(page);
  const actual = await drawPath(page, translate(fixtureCase.points, offsetX, offsetY), 1);
  equal(actual.preview.digest, actual.after!.digest, `${id}: corrected live preview equals release`);
  if (screenshot) await page.screenshot({ path: `${outputRoot}/${screenshot}` });
  await page.getByRole("button", { name: "Undo", exact: true }).click(); await settle(page);
  equal((await canvasSnapshot(page)).digest, before.digest, `${id}: corrected case Undo exact`);
  if (!exact) {
    check(Boolean(actual.after!.bounds) && actual.after!.bounds!.bottom - actual.after!.bounds!.top >= 12, `${id}: deliberate small nook remains visibly bent`);
    return { id, actual: actual.after, expected: null };
  }
  const expected = await drawPath(page, translate(fixtureCase.expectedOutput, offsetX, offsetY), 1);
  equal(actual.after!.digest, expected.after!.digest, `${id}: UI raster matches the exact strengthened centerline`);
  await page.getByRole("button", { name: "Undo", exact: true }).click(); await settle(page);
  equal((await canvasSnapshot(page)).digest, before.digest, `${id}: expected-centerline Undo exact`);
  return { id, actual: actual.after, expected: expected.after };
};
const strengthMetrics = [];
strengthMetrics.push(await compareStrengthRaster("moderate-wobble-dense", 180, 190, "desktop-strength-wobble.png"));
strengthMetrics.push(await compareStrengthRaster("moderate-wobble-sparse", 180, 190));
strengthMetrics.push(await compareStrengthRaster("first-samples-biased-by-wobble", 180, 230));
strengthMetrics.push(await compareStrengthRaster("one-corner-elbow-fast", 220, 160));
strengthMetrics.push(await compareStrengthRaster("one-corner-elbow-slow", 220, 160, "desktop-strength-elbow.png"));
strengthMetrics.push(await compareStrengthRaster("short-arc-single-elbow", 220, 220, "desktop-strength-short-arc.png"));
strengthMetrics.push(await compareStrengthRaster("small-intentional-nook", 240, 220, "desktop-strength-nook.png", false));
strengthMetrics.push(await compareStrengthRaster("circle-like-medium-cadence", 300, 150));
strengthMetrics.push(await compareStrengthRaster("circle-like-high-cadence", 300, 150, "desktop-strength-hexagon.png"));
equal((await canvasSnapshot(page)).digest, empty.digest, "strength-case comparisons restore the exact empty raster");

const shapeCases: Array<{ id: string; path: Array<[number, number]> }> = [
  { id: "shallow", path: [[160, 150], [260, 150], [340, 155], [430, 170], [540, 185]] },
  { id: "zigzag", path: [[160, 230], [240, 180], [320, 230], [400, 180], [480, 230], [560, 180]] },
  { id: "triangle-square", path: [[170, 330], [250, 250], [330, 330], [170, 330], [370, 250], [470, 250], [470, 350], [370, 350], [370, 250]] },
];
const shapeMetrics = [];
for (const shape of shapeCases) {
  const before = await canvasSnapshot(page);
  const result = await drawPath(page, shape.path, 2);
  check(result.after!.pixels > before.pixels, `${shape.id}: live path remains visible`);
  shapeMetrics.push({ id: shape.id, before, after: result.after });
}
await page.screenshot({ path: `${outputRoot}/desktop-shape-cases.png` });
for (let index = 0; index < shapeCases.length; index += 1) { await page.getByRole("button", { name: "Undo", exact: true }).click(); await settle(page); }
equal((await canvasSnapshot(page)).digest, empty.digest, "shape-case Undo sequence restores empty raster");

const matrix = [];
for (const variant of ["Brush", "Pencil", "Sketch", "Pixelate", "Glow"]) {
  await setVariant(page, variant);
  for (const transparency of [0, 50, 90, 100]) {
    await setRange(page, /^Transparency:/, transparency);
    const before = await canvasSnapshot(page);
    const result = await drawPath(page, [[210, 210], [510, 210]], 12);
    const expectedAlpha = Math.round(255 * (100 - transparency) / 100);
    equal(result.after!.maximumAlpha, expectedAlpha, `${variant}/${transparency}: live raster uses configured transparency`);
    if (transparency === 100) equal(result.after!.digest, before.digest, `${variant}/100: fully transparent stroke stays invisible`);
    else {
      check(result.after!.digest !== before.digest && result.after!.pixels > 0, `${variant}/${transparency}: visible stroke survives release`);
      await page.getByRole("button", { name: "Undo", exact: true }).click(); await settle(page);
      equal((await canvasSnapshot(page)).digest, before.digest, `${variant}/${transparency}: Undo exact`);
    }
    matrix.push({ variant, transparency, expectedAlpha, pixels: result.after!.pixels, digest: result.after!.digest });
  }
}
await page.screenshot({ path: `${outputRoot}/desktop-matrix-complete.png` });

await setVariant(page, "Brush");
await setRange(page, /^Transparency:/, 50);
await setRange(page, /^Smoothing:/, 100);
const persistedStroke = await drawPath(page, [[190, 180], [390, 180], [390, 315], [555, 315]], 8);
check(persistedStroke.after!.pixels > 0, "save/open fixture contains Draw Rig pixels");
page.once("dialog", dialog => dialog.accept("Draw Rig Proof"));
await page.getByRole("button", { name: "File", exact: true }).click();
await page.getByRole("menuitem", { name: "Save As", exact: true }).click();
await page.getByRole("status").filter({ hasText: "Saved on this browser" }).waitFor();
await settle(page);
const saved = await canvasSnapshot(page);
equal(saved.digest, persistedStroke.after!.digest, "Save preserves the exact Draw Rig raster");

await page.goto(url);
await page.getByRole("button", { name: /^Open Project/ }).click();
await page.getByRole("button", { name: "Open Draw Rig Proof", exact: true }).click();
await page.locator('canvas[data-workspace-canvas="editable"]').waitFor();
await settle(page);
const reopened = await canvasSnapshot(page);
equal(reopened.digest, saved.digest, "Open restores the exact saved Draw Rig raster");
await page.getByRole("button", { name: "Brush", exact: true }).click();
await page.getByRole("button", { name: "Properties", exact: true }).click();
equal(await page.getByRole("switch", { name: "Draw Rig" }).getAttribute("aria-checked"), "false", "Draw Rig toggle is session-only after open");

const exported = await page.getByRole("textbox", { name: "Chat here" }).evaluate(async element => {
  type Fiber = { return: Fiber | null; memoizedProps?: { onExecuteActionPlan?: (plan: unknown) => Promise<boolean> | boolean } };
  let fiber = (element as unknown as Record<string, Fiber>)[Object.keys(element).find(key => key.startsWith("__reactFiber$"))!];
  let execute: ((plan: unknown) => Promise<boolean> | boolean) | null = null;
  while (fiber) {
    const candidate = fiber.memoizedProps?.onExecuteActionPlan;
    if (typeof candidate === "function") {
      execute = candidate;
      break;
    }
    fiber = fiber.return!;
  }
  if (typeof execute !== "function") throw new Error("missing_export_action_executor");
  const runExport = execute;
  const downloads: Array<{ download: string; href: string }> = [];
  const originalClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function() {
    downloads.push({ download: this.download, href: this.href });
  };
  try {
    const executed = await runExport({
      type: "engine-command",
      commandType: "ui-command",
      action: "export-current-frame",
      label: "Export Current Frame",
      targetSystem: "workspace-ui",
      executionGoal: "Export the current frame as an image artifact.",
      executionMode: "execute-now",
      commandChain: "start",
      parameters: { scope: "current-frame" },
    });
    const download = downloads[0] ?? null;
    if (!download) return { executed, download, nonWhitePixels: 0, width: 0, height: 0 };
    const image = new Image();
    image.src = download.href;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const bytes = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let nonWhitePixels = 0;
    for (let offset = 0; offset < bytes.length; offset += 4) {
      if (bytes[offset] !== 255 || bytes[offset + 1] !== 255 || bytes[offset + 2] !== 255 || bytes[offset + 3] !== 255) nonWhitePixels += 1;
    }
    return { executed, download: { download: download.download, dataUrlBytes: download.href.length }, nonWhitePixels, width: canvas.width, height: canvas.height };
  } finally {
    HTMLAnchorElement.prototype.click = originalClick;
  }
});
check(exported.executed === true, "actual workspace export command executes");
check(Boolean(exported.download?.download.match(/Draw-Rig-Proof-frame-1\.png$/)), "export uses the expected PNG filename");
check((exported.download?.dataUrlBytes ?? 0) > 100 && exported.nonWhitePixels > 0, "exported PNG contains the saved Draw Rig raster");

const structuredRigMentions = await page.evaluate(async () => {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("diamond-animation-unified-v2");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const stores = [...database.objectStoreNames];
  if (stores.length === 0) {
    database.close();
    return [];
  }
  const transaction = database.transaction(stores, "readonly");
  const values = await Promise.all(stores.map(name => new Promise<unknown[]>((resolve, reject) => {
    const request = transaction.objectStore(name).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  })));
  database.close();
  const mentions: string[] = [];
  const visit = (value: unknown, path = "root", seen = new WeakSet<object>()) => {
    if (!value || typeof value !== "object" || ArrayBuffer.isView(value) || value instanceof Blob || value instanceof ImageData || seen.has(value)) return;
    seen.add(value);
    for (const [key, nested] of Object.entries(value)) {
      const nextPath = `${path}.${key}`;
      if (/draw.?rig|corridor/i.test(key) || typeof nested === "string" && /drawRig|causal-fixed-corridor/i.test(nested)) mentions.push(nextPath);
      visit(nested, nextPath, seen);
    }
  };
  values.forEach((rows, storeIndex) => visit(rows, stores[storeIndex]));
  return mentions;
});
equal(structuredRigMentions, [], "Draw Rig creates no structured persistent rig data");

const compact = await prepareContext({ width: 390, height: 844 });
const compactSwitch = compact.page.getByRole("switch", { name: "Draw Rig" });
await compactSwitch.scrollIntoViewIfNeeded();
check(await compactSwitch.isVisible(), "Draw Rig switch is visible at compact width");
await compactSwitch.click();
equal(await compactSwitch.getAttribute("aria-checked"), "true", "compact Draw Rig toggle works");
const compactBefore = await canvasSnapshot(compact.page);
const compactStroke = await drawPath(compact.page, [[180, 180], [440, 180], [440, 300]], 8);
check(compactStroke.after!.digest !== compactBefore.digest && compactStroke.after!.pixels > 0, "compact viewport Draw Rig stroke commits");
await compact.page.screenshot({ path: `${outputRoot}/compact-draw-rig.png`, fullPage: true });

const transitions = await prepareContext({ width: 1200, height: 760 });
await transitions.page.getByRole("switch", { name: "Draw Rig" }).click();
const transitionEmpty = await canvasSnapshot(transitions.page);
const transitionStart = await worldPoint(transitions.page, 190, 180);
const transitionEnd = await worldPoint(transitions.page, 520, 270);
const beginTransitionDraft = async (baseline: CanvasSnapshot) => {
  await transitions.page.mouse.move(transitionStart.x, transitionStart.y);
  await transitions.page.mouse.down();
  await transitions.page.mouse.move(transitionEnd.x, transitionEnd.y, { steps: 8 });
  await settle(transitions.page);
  const preview = await canvasSnapshot(transitions.page);
  check(preview.pixels > baseline.pixels, "transition fixture has a visible in-progress preview");
};
const layerIds = async () => transitions.page.locator("button[data-timeline-cell][data-layer-id]").evaluateAll(cells => [...new Set(cells.map(cell => cell.getAttribute("data-layer-id")!))]);
const frame = (layerId: string, frameIndex: number) => transitions.page.locator(`button[data-timeline-cell][data-layer-id="${layerId}"][data-frame-index="${frameIndex}"]`).last();
const firstLayer = (await layerIds())[0];
check(Boolean(firstLayer), "transition fixture exposes the active layer");
await frame(firstLayer, 0).click({ button: "right" });
await transitions.page.getByRole("button", { name: "Insert Blank Keyframe", exact: true }).click();
await settle(transitions.page);
await frame(firstLayer, 0).click(); await settle(transitions.page);
const transitionFixtureBaseline = await canvasSnapshot(transitions.page);
equal(transitionFixtureBaseline.digest, transitionEmpty.digest, "blank-keyframe fixture preserves the original frame");
await beginTransitionDraft(transitionFixtureBaseline);
await clickWithoutPointerRelease(frame(firstLayer, 1));
await settle(transitions.page);
await transitions.page.mouse.up(); await settle(transitions.page);
await frame(firstLayer, 0).click(); await settle(transitions.page);
const frameTransitionAfter = await canvasSnapshot(transitions.page);
equal(frameTransitionAfter.digest, transitionEmpty.digest, "frame switching cancels Draw Rig without leaking pixels");

await transitions.page.getByRole("button", { name: "+ Layer", exact: true }).click(); await settle(transitions.page);
const secondLayer = (await layerIds()).find(id => id !== firstLayer)!;
check(Boolean(secondLayer), "transition fixture creates a second layer");
await frame(firstLayer, 0).click(); await settle(transitions.page);
const layerFixtureBaseline = await canvasSnapshot(transitions.page);
equal(layerFixtureBaseline.pixels, 0, "added-layer fixture keeps the original frame transparent");
await beginTransitionDraft(layerFixtureBaseline);
await clickWithoutPointerRelease(frame(secondLayer, 0));
await settle(transitions.page);
await transitions.page.mouse.up(); await settle(transitions.page);
await frame(firstLayer, 0).click(); await settle(transitions.page);
const firstLayerAfterTransition = await canvasSnapshot(transitions.page);
equal(firstLayerAfterTransition.digest, layerFixtureBaseline.digest, "layer switching cancels Draw Rig without leaking pixels");

await beginTransitionDraft(layerFixtureBaseline);
await transitions.page.getByRole("button", { name: "Play", exact: true }).evaluate(element => (element as HTMLButtonElement).click());
await settle(transitions.page);
await transitions.page.getByRole("button", { name: "Pause", exact: true }).click();
await transitions.page.mouse.up(); await frame(firstLayer, 0).click(); await settle(transitions.page);
equal((await canvasSnapshot(transitions.page)).digest, layerFixtureBaseline.digest, "playback transition cancels Draw Rig without leaking pixels");

const longSession = await prepareContext({ width: 1200, height: 760 });
await longSession.page.getByRole("switch", { name: "Draw Rig" }).click();
const longSessionEmpty = await canvasSnapshot(longSession.page);
await longSession.page.evaluate(() => (globalThis as typeof globalThis & { gc?: () => void }).gc?.());
const heapBefore = await longSession.page.evaluate(() => (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null);
for (let cycle = 0; cycle < 32; cycle += 1) {
  const y = 160 + cycle % 5 * 24;
  const path = await Promise.all(([[180, y], [330, y + cycle % 3 - 1], [480, y], [520, y + 55]] as Array<[number, number]>).map(([x, pointY]) => worldPoint(longSession.page, x, pointY)));
  await longSession.page.mouse.move(path[0].x, path[0].y);
  await longSession.page.mouse.down();
  for (const next of path.slice(1)) await longSession.page.mouse.move(next.x, next.y, { steps: cycle % 2 ? 1 : 10 });
  await longSession.page.mouse.up(); await settle(longSession.page);
  check(!(await longSession.page.getByRole("button", { name: "Undo", exact: true }).isDisabled()), `long session cycle ${cycle}: commit is undoable`);
  await longSession.page.getByRole("button", { name: "Undo", exact: true }).click(); await settle(longSession.page);
}
const longSessionAfter = await canvasSnapshot(longSession.page);
equal(longSessionAfter.digest, longSessionEmpty.digest, "32-cycle long session restores the exact raster without residue");
await longSession.page.evaluate(() => (globalThis as typeof globalThis & { gc?: () => void }).gc?.());
const heapAfter = await longSession.page.evaluate(() => (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null);
if (heapBefore !== null && heapAfter !== null) check(heapAfter - heapBefore < 128 * 1024 * 1024, "32-cycle settled heap growth stays below 128 MiB");

await desktop.context.close();
await compact.context.close();
await transitions.context.close();
await longSession.context.close();
await browser.close();
equal(errors, [], "no browser or page errors");

const evidence = [
  "desktop-live-straight.png",
  "desktop-live-first-bend.png",
  "desktop-live-second-bend.png",
  "desktop-strength-wobble.png",
  "desktop-strength-elbow.png",
  "desktop-strength-nook.png",
  "desktop-strength-hexagon.png",
  "desktop-shape-cases.png",
  "desktop-matrix-complete.png",
  "compact-draw-rig.png",
].map(name => {
  const path = `${outputRoot}/${name}`;
  const bytes = readFileSync(path);
  return { path, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
});
equal(currentSourceDigest(), sourceDigestBefore, "tracked proof sources stay unchanged during browser execution");
const report = {
  status: "PASS",
  assertions,
  url,
  sourceDigestBefore,
  sourceDigestAfter: currentSourceDigest(),
  core: { empty, straightPreview, firstBend, completePreview, released },
  strengthMetrics,
  shapeMetrics,
  matrix,
  saveOpenExport: { saved, reopened, exported },
  transitions: { empty: transitionEmpty, firstLayer, secondLayer },
  longSession: { cycles: 32, empty: longSessionEmpty, after: longSessionAfter, heapBefore, heapAfter },
  structuredRigMentions,
  errors,
  evidence,
};
writeFileSync(`${outputRoot}/draw-rig.json`, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ status: report.status, assertions, evidence: evidence.length, matrix: matrix.length }));
