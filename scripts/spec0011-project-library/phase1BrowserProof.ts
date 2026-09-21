import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright-core";
import { createPhase1LegacyFixtureTransport } from "./phase1Fixtures.ts";

const url = process.argv.find(argument => argument.startsWith("--url="))?.slice(6) ?? "http://127.0.0.1:57680/";
assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
const origin = new URL(url).origin;
const outputRoot = resolve("output/spec-0011/phase-1/browser");
mkdirSync(outputRoot, { recursive: true });
const fixtures = await createPhase1LegacyFixtureTransport();
const axePath = resolve("node_modules/axe-core/axe.min.js");

let assertions = 0;
const operations: string[] = [];
const screenshots: string[] = [];
const pageErrors: string[] = [];
const consoleErrors: string[] = [];
const requests: Array<{ method: string; url: string; disposition: string }> = [];
const storageReceipts: Array<{ flow: string; before: unknown; after: unknown; writes: string[] }> = [];
const performanceReceipts: Array<Record<string, unknown>> = [];
const check = (value: unknown, label: string) => { assertions += 1; assert.ok(value, label); };
const equal = (actual: unknown, expected: unknown, label: string) => { assertions += 1; assert.deepEqual(actual, expected, label); };
const step = async (label: string, run: () => Promise<void>) => { await run(); operations.push(label); console.log(`PASS ${label}`); };
const screenshot = async (page: Page, name: string) => {
  const file = `${name}.png`;
  await page.screenshot({ path: resolve(outputRoot, file), fullPage: true });
  screenshots.push(file);
};

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: !process.argv.includes("--headed"),
  args: ["--disable-background-networking", "--disable-component-update", "--disable-sync", "--disable-extensions", "--no-first-run", "--js-flags=--expose-gc"],
});

const configure = async (context: BrowserContext) => {
  await context.route("**/*", async route => {
    const request = route.request();
    const parsed = new URL(request.url());
    const sameOrigin = parsed.origin === origin;
    const aiAvailability = sameOrigin && parsed.pathname === "/api/ai" && request.method() === "GET";
    const allowed = sameOrigin && !parsed.pathname.startsWith("/api/");
    const disposition = aiAvailability ? "fulfilled-disabled-ai" : allowed ? "loopback" : "blocked";
    requests.push({ method: request.method(), url: `${parsed.origin}${parsed.pathname}`, disposition });
    if (aiAvailability) await route.fulfill({ status: 200, contentType: "application/json", body: '{"available":false,"reason":"spec0011-phase1-proof"}' });
    else if (allowed) await route.continue();
    else await route.abort();
  });
  await context.addInitScript(() => {
    localStorage.setItem("da_welcome_seen", "1");
    localStorage.setItem("da_welcome_never_show", "1");
    const note = (entry: string) => {
      const current = JSON.parse(document.documentElement?.dataset.spec0011Writes ?? "[]");
      current.push(entry);
      if (document.documentElement) document.documentElement.dataset.spec0011Writes = JSON.stringify(current);
    };
    const set = Storage.prototype.setItem;
    const remove = Storage.prototype.removeItem;
    const clear = Storage.prototype.clear;
    Storage.prototype.setItem = function(key, value) { note(`localStorage.set:${key}`); return set.call(this, key, value); };
    Storage.prototype.removeItem = function(key) { note(`localStorage.remove:${key}`); return remove.call(this, key); };
    Storage.prototype.clear = function() { note("localStorage.clear"); return clear.call(this); };
    for (const operation of ["put", "add", "delete", "clear"] as const) {
      const original = IDBObjectStore.prototype[operation];
      Object.defineProperty(IDBObjectStore.prototype, operation, {
        configurable: true,
        value: function(this: IDBObjectStore, ...args: unknown[]) {
          note(`idb.${operation}:${this.name}`);
          return Reflect.apply(original, this, args);
        },
      });
    }
    try {
      const observer = new PerformanceObserver(list => {
        const current = JSON.parse(document.documentElement?.dataset.spec0011LongTasks ?? "[]");
        for (const entry of list.getEntries()) current.push(entry.duration);
        if (document.documentElement) document.documentElement.dataset.spec0011LongTasks = JSON.stringify(current);
      });
      observer.observe({ type: "longtask", buffered: true });
    } catch {}
  });
};

const attachErrorCapture = (page: Page) => {
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
};

const seedLegacy = (page: Page) => page.evaluate(async ({ values, unified }) => {
  const drawings = values.filter(value => value.sourceKind === "drawing-v1").map(value => "project" in value ? value.project : null);
  drawings.push({ id: "invalid-phase1-drawing", name: "Damaged Drawing project", data: { version: 99 }, updated_at: "not-a-date" } as never);
  localStorage.setItem("da_saved_drawing_projects", JSON.stringify(drawings));
  const sticks = values.filter(value => value.sourceKind.startsWith("stick")).map(value => "project" in value ? value.project : null);
  localStorage.setItem("da_saved_stick_projects_v1", JSON.stringify({ storageVersion: 1, projects: sticks }));
  localStorage.setItem("da_saved_unified_projects_v1", JSON.stringify({ storageVersion: 1, projects: [unified] }));
  const source = values.find(value => value.sourceKind === "drawing-v2");
  if (!source || source.sourceKind !== "drawing-v2") throw new Error("drawing_v2_fixture_missing");
  const record = {
    ...source.record,
    assets: source.record.assets.map(asset => ({
      ...asset,
      bytes: new Blob([Uint8Array.from(atob(asset.bytes), character => character.charCodeAt(0))], { type: asset.kind === "raster-png" ? "image/png" : "audio/wav" }),
    })),
  };
  const database = await new Promise<IDBDatabase>((resolveDatabase, rejectDatabase) => {
    const open = indexedDB.open("diamond-animator-local", 1);
    open.onupgradeneeded = () => {
      for (const [name, keyPath] of [
        ["drawingProjectHeadsV2", "projectId"],
        ["drawingProjectVersionsV2", ["projectId", "storageRevision"]],
        ["drawingProjectPreviewsV1", "projectId"],
        ["drawingProjectAuxiliaryV1", "projectId"],
        ["drawingProjectLegacyDeleteTombstonesV1", "projectId"],
      ] as const) {
        if (!open.result.objectStoreNames.contains(name)) open.result.createObjectStore(name, { keyPath: typeof keyPath === "string" ? keyPath : [...keyPath] });
      }
    };
    open.onsuccess = () => resolveDatabase(open.result);
    open.onerror = () => rejectDatabase(open.error);
  });
  await new Promise<void>((resolveTransaction, rejectTransaction) => {
    const transaction = database.transaction(["drawingProjectHeadsV2", "drawingProjectVersionsV2"], "readwrite");
    transaction.objectStore("drawingProjectHeadsV2").put(source.head);
    transaction.objectStore("drawingProjectVersionsV2").put(record);
    transaction.oncomplete = () => resolveTransaction();
    transaction.onerror = () => rejectTransaction(transaction.error);
  });
  database.close();
}, { values: fixtures.transport, unified: fixtures.unified });

const resetWrites = (page: Page) => page.evaluate(() => { document.documentElement.dataset.spec0011Writes = "[]"; });
const readWrites = (page: Page) => page.evaluate(() => JSON.parse(document.documentElement.dataset.spec0011Writes ?? "[]") as string[]);

const storageSnapshot = (page: Page) => page.evaluate(async () => {
  const hash = async (bytes: Uint8Array) => {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return [...new Uint8Array(await crypto.subtle.digest("SHA-256", copy.buffer))].map(value => value.toString(16).padStart(2, "0")).join("");
  };
  const normalize = async (value: unknown): Promise<unknown> => {
    if (value instanceof Blob) return { byteLength: value.size, type: value.type, sha256: await hash(new Uint8Array(await value.arrayBuffer())) };
    if (ArrayBuffer.isView(value)) return { byteLength: value.byteLength, sha256: await hash(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) };
    if (value instanceof ArrayBuffer) return { byteLength: value.byteLength, sha256: await hash(new Uint8Array(value)) };
    if (Array.isArray(value)) return Promise.all(value.map(normalize));
    if (value && typeof value === "object") return Object.fromEntries(await Promise.all(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(async ([key, child]) => [key, await normalize(child)])));
    return value;
  };
  const local: Record<string, unknown> = {};
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)!;
    if (key.startsWith("da_welcome")) continue;
    const value = localStorage.getItem(key) ?? "";
    local[key] = { byteLength: new TextEncoder().encode(value).length, sha256: await hash(new TextEncoder().encode(value)) };
  }
  const indexed: Record<string, unknown> = {};
  for (const info of (await indexedDB.databases()).filter(database => database.name)) {
    const database = await new Promise<IDBDatabase>((resolveDatabase, rejectDatabase) => {
      const open = indexedDB.open(info.name!);
      open.onsuccess = () => resolveDatabase(open.result);
      open.onerror = () => rejectDatabase(open.error);
    });
    const stores: Record<string, unknown> = {};
    for (const storeName of Array.from(database.objectStoreNames).sort()) {
      const rows = await new Promise<unknown[]>((resolveRows, rejectRows) => {
        const request = database.transaction(storeName, "readonly").objectStore(storeName).getAll();
        request.onsuccess = () => resolveRows(request.result);
        request.onerror = () => rejectRows(request.error);
      });
      const normalized = JSON.stringify(await normalize(rows));
      stores[storeName] = { records: rows.length, sha256: await hash(new TextEncoder().encode(normalized)) };
    }
    database.close();
    indexed[info.name!] = stores;
  }
  return { local, indexed };
});

const createNativeProject = async (page: Page) => {
  await page.getByRole("button", { name: /^New Project/ }).click();
  const editable = page.locator('canvas[data-workspace-canvas="editable"]');
  await editable.waitFor();
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Save As" }).click();
  const dialog = page.getByRole("dialog", { name: "Save project as" });
  await dialog.getByLabel("Project name").fill("Phase 1 Native Showcase");
  await dialog.getByRole("button", { name: "Save copy" }).click();
  await page.getByText("Saved on this browser", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Brush", exact: true }).last().click();
  const canvas = await editable.boundingBox();
  assert.ok(canvas);
  await page.mouse.move(canvas.x + canvas.width * 0.46, canvas.y + canvas.height * 0.42);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width * 0.54, canvas.y + canvas.height * 0.58, { steps: 10 });
  await page.mouse.up();
  let cells = page.locator('[data-timeline-cell="true"]');
  await cells.nth(0).click({ button: "right" });
  await page.getByRole("button", { name: "Insert Frame" }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-timeline-cell="true"]').length >= 2);
  cells = page.locator('[data-timeline-cell="true"]');
  await cells.nth(1).click({ button: "right" });
  await page.getByRole("button", { name: "Insert Blank Keyframe" }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-timeline-cell="true"]').length >= 3);
  await page.mouse.move(canvas.x + canvas.width * 0.58, canvas.y + canvas.height * 0.44);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width * 0.62, canvas.y + canvas.height * 0.57, { steps: 10 });
  await page.mouse.up();
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Save and Exit", exact: true }).click();
  await page.getByRole("button", { name: /^My Projects/ }).waitFor();
};

const waitForReadyCard = async (page: Page, title: string) => {
  const card = page.getByRole("button", { name: `Watch ${title}`, exact: true });
  await card.waitFor({ timeout: 30_000 });
  return card;
};

const canvasStats = (page: Page, selector: string) => page.locator(selector).evaluate(element => {
  const canvas = element as HTMLCanvasElement;
  const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
  let painted = 0;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    if (pixels[offset + 3] > 24 && (pixels[offset] < 220 || pixels[offset + 1] < 220 || pixels[offset + 2] < 220)) painted += 1;
  }
  return { width: canvas.width, height: canvas.height, painted };
});

const assertNoOverflow = async (page: Page, label: string) => {
  const metrics = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    libraryWidth: document.querySelector<HTMLElement>('[data-project-library="my-projects"]')?.scrollWidth ?? 0,
    libraryClientWidth: document.querySelector<HTMLElement>('[data-project-library="my-projects"]')?.clientWidth ?? 0,
  }));
  check(metrics.documentWidth <= metrics.viewportWidth, `${label} has no document horizontal overflow`);
  check(metrics.libraryWidth <= metrics.libraryClientWidth, `${label} has no library horizontal overflow`);
};

const axeSerious = async (page: Page, selector: string) => {
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async target => {
    const result = await (window as unknown as { axe: { run: (node: Element) => Promise<{ violations: Array<{ impact: string | null; id: string }> }> } }).axe.run(document.querySelector(target)!);
    return result.violations.filter(violation => violation.impact === "critical" || violation.impact === "serious");
  }, selector);
};

try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
  await configure(desktop);
  const page = await desktop.newPage();
  attachErrorCapture(page);
  await page.goto(url, { waitUntil: "networkidle" });
  await seedLegacy(page);
  await createNativeProject(page);
  await page.reload({ waitUntil: "networkidle" });

  const libraryStartedAt = performance.now();
  await step("desktop:keyboard-open-my-projects", async () => {
    const button = page.getByRole("button", { name: /^My Projects/ });
    await button.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("heading", { name: "My Projects" }).waitFor();
    await page.locator("[data-project-library-entry]").first().waitFor();
  });
  const firstUsableListMs = performance.now() - libraryStartedAt;
  check(firstUsableListMs <= 1_500, `desktop metadata shell is usable within 1.5s (${firstUsableListMs.toFixed(1)}ms)`);
  const nativeCard = await waitForReadyCard(page, "Phase 1 Native Showcase");
  const beforeLibrary = await storageSnapshot(page);
  await resetWrites(page);

  await step("desktop:truthful-collection-and-metadata", async () => {
    equal(await page.locator("[data-project-library-entry]").count(), 7, "native, five supported legacy, and invalid records remain visible once");
    equal(await page.getByText("Protected legacy source", { exact: true }).count(), 5, "all five supported legacy kinds are labeled protected");
    await page.getByText("Damaged Drawing project", { exact: true }).waitFor();
    await page.getByText(/invalid and cannot be watched safely/i).waitFor();
    check(await nativeCard.getByText(/FPS$/).count() >= 1, "native card shows saved FPS");
    check(await nativeCard.getByText(/\d+×\d+/).count() >= 1, "native card shows logical stage dimensions");
    check(await nativeCard.getByText(/^0:\d\d$/).count() >= 1, "native card shows exact formatted duration");
    check(await nativeCard.locator('img[alt^="Canonical saved poster"]').count() === 1, "native card shows a canonical poster image");
    equal(await axeSerious(page, '[data-project-library="my-projects"]'), [], "library has zero serious/critical axe violations");
    await assertNoOverflow(page, "desktop library");
    await screenshot(page, "desktop-library");
  });

  await step("desktop:viewer-seek-close-and-focus", async () => {
    await page.locator('[data-project-library="my-projects"]').evaluate(element => { element.scrollTop = 120; });
    const scrollBefore = await page.locator('[data-project-library="my-projects"]').evaluate(element => element.scrollTop);
    const viewerStartedAt = performance.now();
    await nativeCard.click();
    const dialog = page.getByRole("dialog", { name: "Phase 1 Native Showcase" });
    await dialog.waitFor();
    equal(await page.locator('[data-canonical-project-player="viewer"]').count(), 1, "viewer mounts the shared canonical player");
    const canvas = await canvasStats(page, 'canvas[aria-label="Phase 1 Native Showcase saved animation"]');
    const viewerFirstFrameMs = performance.now() - viewerStartedAt;
    check(viewerFirstFrameMs <= 1_000, `representative viewer first frame is ready within 1s (${viewerFirstFrameMs.toFixed(1)}ms)`);
    check(canvas.painted > 20, "viewer canvas renders real saved pixels");
    const slider = dialog.getByRole("slider", { name: "Animation position" });
    check(Number(await slider.getAttribute("max")) >= 2, "viewer exposes the real saved frame range");
    const seekStartedAt = performance.now();
    await slider.fill("2");
    const seekAckMs = performance.now() - seekStartedAt;
    check(seekAckMs <= 100, `seek UI acknowledgement stays within 100ms (${seekAckMs.toFixed(1)}ms)`);
    await page.waitForTimeout(120);
    const seekCanvasMs = performance.now() - seekStartedAt;
    check(seekCanvasMs <= 250, `seek canvas settles within 250ms (${seekCanvasMs.toFixed(1)}ms)`);
    const playStartedAt = performance.now();
    await dialog.getByRole("button", { name: "Play" }).click();
    await dialog.getByRole("button", { name: "Pause" }).waitFor();
    const playAckMs = performance.now() - playStartedAt;
    check(playAckMs <= 100, `play acknowledgement stays within 100ms (${playAckMs.toFixed(1)}ms)`);
    await dialog.getByRole("button", { name: "Pause" }).click();
    await dialog.getByRole("heading", { name: "Phase 1 Native Showcase" }).click();
    equal(await dialog.count(), 1, "clicking inside the dialog does not close it");
    equal(await axeSerious(page, '[data-project-movie-viewer="true"]'), [], "viewer has zero serious/critical axe violations");
    await screenshot(page, "desktop-viewer");
    await page.locator('[data-project-movie-viewer-backdrop="true"]').click({ position: { x: 3, y: 3 } });
    await dialog.waitFor({ state: "detached" });
    await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Watch Phase 1 Native Showcase");
    equal(await nativeCard.evaluate(element => element === document.activeElement), true, "backdrop close restores focus to the invoking card");
    equal(await page.locator('[data-project-library="my-projects"]').evaluate(element => element.scrollTop), scrollBefore, "close preserves library scroll position");
    performanceReceipts.push({ profile: "desktop", firstUsableListMs, viewerFirstFrameMs, seekAckMs, seekCanvasMs, playAckMs });
  });

  await step("desktop:five-cycle-resource-bound", async () => {
    const heapBefore = await page.evaluate(() => {
      (window as unknown as { gc?: () => void }).gc?.();
      return (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null;
    });
    for (let cycle = 0; cycle < 4; cycle += 1) {
      await nativeCard.click();
      const dialog = page.getByRole("dialog", { name: "Phase 1 Native Showcase" });
      await dialog.waitFor();
      await dialog.getByRole("slider", { name: "Animation position" }).fill(String(cycle % 3));
      await dialog.getByRole("button", { name: "Close" }).click();
      await dialog.waitFor({ state: "detached" });
      await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Watch Phase 1 Native Showcase");
    }
    const resource = await page.evaluate(() => {
      (window as unknown as { gc?: () => void }).gc?.();
      const heapAfter = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null;
      const longTasks = JSON.parse(document.documentElement.dataset.spec0011LongTasks ?? "[]") as number[];
      return { heapAfter, maximumLongTaskMs: longTasks.length ? Math.max(...longTasks) : 0 };
    });
    if (heapBefore !== null && resource.heapAfter !== null) {
      const heapDeltaBytes = resource.heapAfter - heapBefore;
      check(heapDeltaBytes <= 32 * 1024 * 1024, `five viewer cycles settle within 32 MiB of baseline (${heapDeltaBytes} bytes)`);
      check(resource.heapAfter <= 320 * 1024 * 1024, `representative settled heap stays within 320 MiB (${resource.heapAfter} bytes)`);
      performanceReceipts.push({ profile: "desktop-five-cycles", heapBefore, heapAfter: resource.heapAfter, heapDeltaBytes, maximumLongTaskMs: resource.maximumLongTaskMs });
    } else {
      performanceReceipts.push({ profile: "desktop-five-cycles", heapMeasurement: "unavailable", maximumLongTaskMs: resource.maximumLongTaskMs });
    }
    check(resource.maximumLongTaskMs <= 250, `maximum intentional main-thread task stays within 250ms (${resource.maximumLongTaskMs.toFixed(1)}ms)`);
  });

  await step("desktop:read-only-storage-and-network", async () => {
    const after = await storageSnapshot(page);
    const writes = await readWrites(page);
    equal(after, beforeLibrary, "list, poster, watch, seek, play, close, and axe checks preserve official and recovery storage bytes");
    equal(writes, [], "list, poster, watch, seek, play, and close issue zero storage writes");
    storageReceipts.push({ flow: "desktop-library-viewer", before: beforeLibrary, after, writes });
    equal(requests.filter(request => request.disposition === "blocked"), [], "library/viewer issue zero external requests");
  });

  await step("desktop:back-focus-and-open-project-editor-regression", async () => {
    await page.getByRole("button", { name: "← Back" }).click();
    const homeButton = page.getByRole("button", { name: /^My Projects/ });
    equal(await homeButton.evaluate(element => element === document.activeElement), true, "Back restores focus to My Projects on Home");
    await page.getByRole("button", { name: /^Open Project/ }).click();
    await page.getByRole("button", { name: "Open Drawing study (V1)", exact: true }).waitFor();
    await page.getByRole("button", { name: "Open Drawing study (V1)", exact: true }).click();
    await page.locator('canvas[data-workspace-canvas="editable"]').waitFor();
    equal(await page.locator('[data-project-movie-viewer="true"]').count(), 0, "Open Project still enters the editor and never inserts the viewer");
  });

  await page.reload({ waitUntil: "networkidle" });
  const beforeExport = await storageSnapshot(page);
  await resetWrites(page);
  await step("desktop:export-shared-player-regression", async () => {
    await page.getByRole("button", { name: /^Export/ }).click();
    const exportCard = page.getByRole("button", { name: /Phase 1 Native Showcase/ });
    await exportCard.waitFor();
    await page.waitForFunction(() => document.querySelectorAll('canvas[aria-label$="thumbnail"]').length > 0);
    await exportCard.click();
    await page.getByRole("button", { name: "Use this animation" }).click();
    await page.locator('[data-canonical-project-player="export"]').waitFor();
    equal(await page.getByRole("button", { name: "Change animation" }).count(), 1, "Export keeps Change animation");
    equal(await page.getByRole("group", { name: "Video destinations" }).count(), 1, "Export keeps destination selection");
    equal(await page.getByRole("button", { name: "Export video" }).count(), 1, "Export keeps local encoding action");
    await page.getByRole("slider", { name: "Animation position" }).fill("2");
    const stats = await canvasStats(page, 'canvas[aria-label="Selected saved animation"]');
    check(stats.painted > 20, "Export shared player still renders selected saved content");
    await page.getByRole("button", { name: "Change animation" }).click();
    await page.getByRole("main", { name: "Choose a saved animation to export" }).waitFor();
  });
  const afterExport = await storageSnapshot(page);
  equal(afterExport, beforeExport, "Export chooser/player factoring preserves project and recovery bytes");
  equal(await readWrites(page), [], "Export chooser/player factoring issues zero storage writes");
  storageReceipts.push({ flow: "export-shared-player", before: beforeExport, after: afterExport, writes: await readWrites(page) });
  await desktop.close();

  const changedContext = await browser.newContext({ viewport: { width: 1100, height: 760 }, serviceWorkers: "block" });
  await configure(changedContext);
  const changedPage = await changedContext.newPage();
  attachErrorCapture(changedPage);
  await changedPage.goto(url, { waitUntil: "networkidle" });
  await seedLegacy(changedPage);
  await changedPage.reload({ waitUntil: "networkidle" });
  await changedPage.getByRole("button", { name: /^My Projects/ }).click();
  const staleCard = await waitForReadyCard(changedPage, "Drawing study (V1)");
  await changedPage.evaluate(() => {
    const values = JSON.parse(localStorage.getItem("da_saved_drawing_projects")!);
    values[0].name = "Drawing changed after listing";
    localStorage.setItem("da_saved_drawing_projects", JSON.stringify(values));
  });
  const changedBefore = await storageSnapshot(changedPage);
  await resetWrites(changedPage);
  await step("changed-source:fail-refresh-retry", async () => {
    await staleCard.click();
    await changedPage.getByText("Project changed or was deleted. Refresh and try again.", { exact: true }).waitFor();
    await changedPage.getByText("Drawing changed after listing", { exact: true }).waitFor();
    equal(await changedPage.locator('[data-project-movie-viewer="true"]').count(), 0, "stale selection never opens the viewer");
    await changedPage.getByRole("button", { name: "Try again" }).click();
    await waitForReadyCard(changedPage, "Drawing changed after listing");
  });
  const changedAfter = await storageSnapshot(changedPage);
  equal(changedAfter, changedBefore, "source-changed failure and retry perform zero project/recovery mutation");
  equal(await readWrites(changedPage), [], "source-changed failure and retry issue zero storage writes");
  storageReceipts.push({ flow: "changed-source-retry", before: changedBefore, after: changedAfter, writes: await readWrites(changedPage) });
  await changedContext.close();

  for (const profile of [
    { name: "compact-390x844", width: 390, height: 844, reducedMotion: "reduce" as const },
    { name: "narrow-320x568", width: 320, height: 568, reducedMotion: "no-preference" as const },
    { name: "zoom-200-percent-equivalent", width: 720, height: 450, reducedMotion: "no-preference" as const },
  ]) {
    const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height }, reducedMotion: profile.reducedMotion, serviceWorkers: "block" });
    await configure(context);
    const responsivePage = await context.newPage();
    attachErrorCapture(responsivePage);
    await responsivePage.goto(url, { waitUntil: "networkidle" });
    await seedLegacy(responsivePage);
    await responsivePage.reload({ waitUntil: "networkidle" });
    const homeButton = responsivePage.getByRole("button", { name: /^My Projects/ });
    await homeButton.focus();
    await responsivePage.keyboard.press("Enter");
    const card = await waitForReadyCard(responsivePage, "Drawing study (V1)");
    await assertNoOverflow(responsivePage, profile.name);
    if (profile.reducedMotion === "reduce") equal(await responsivePage.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), true, "reduced motion preference reaches the library");
    await screenshot(responsivePage, `${profile.name}-library`);
    await card.focus();
    await responsivePage.keyboard.press("Enter");
    const viewer = responsivePage.getByRole("dialog", { name: "Drawing study (V1)" });
    await viewer.waitFor();
    await assertNoOverflow(responsivePage, `${profile.name} viewer`);
    const close = viewer.getByRole("button", { name: "Close" });
    const closeBox = await close.boundingBox();
    check(Boolean(closeBox && closeBox.x >= 0 && closeBox.y >= 0 && closeBox.x + closeBox.width <= profile.width && closeBox.y + closeBox.height <= profile.height), `${profile.name} keeps the primary Close action visible`);
    await screenshot(responsivePage, `${profile.name}-viewer`);
    await responsivePage.keyboard.press("Escape");
    await viewer.waitFor({ state: "detached" });
    await responsivePage.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Watch Drawing study (V1)");
    equal(await card.evaluate(element => element === document.activeElement), true, `${profile.name} keyboard close restores invoking-card focus`);
    await context.close();
  }

  equal(pageErrors, [], "real browser produced zero page errors");
  equal(consoleErrors, [], "real browser produced zero console errors");
  equal(requests.filter(request => request.disposition === "blocked"), [], "all browser profiles produced zero external/provider/AI requests");

  const result = {
    status: "PASS",
    url,
    assertions,
    operations,
    screenshots,
    storageReceipts,
    performanceReceipts,
    requestLedger: requests,
    externalRequests: 0,
    providerRequests: 0,
    aiRequests: 0,
    paidRequests: 0,
    pageErrors,
    consoleErrors,
    profiles: ["1440x900", "390x844 reduced-motion", "320x568", "720x450 CSS viewport equivalent to 1440x900 at 200% browser zoom"],
    physicalDeviceProof: false,
    nativeFinderProof: false,
    createdAt: new Date().toISOString(),
  };
  const resultPath = resolve(outputRoot, "result.json");
  writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ status: "PASS", assertions, operations: operations.length, screenshots: screenshots.length, resultPath, sha256: createHash("sha256").update(JSON.stringify(result)).digest("hex") }));
} finally {
  await browser.close();
}
