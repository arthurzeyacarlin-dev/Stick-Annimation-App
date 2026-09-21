import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type BrowserContext, type Page } from "playwright-core";

const url = process.argv.find(argument => argument.startsWith("--url="))?.slice(6) ?? "http://127.0.0.1:57620/";
assert.match(url, /^http:\/\/127\.0\.0\.1:[0-9]+\/$/);
const origin = new URL(url).origin;
const outputRoot = "output/spec-0010/phase-2";
const screenshotRoot = `${outputRoot}/screenshots`;
mkdirSync(screenshotRoot, { recursive: true });

let assertions = 0;
const check = (value: unknown, label: string) => { assertions += 1; assert.ok(value, label); };
const equal = (actual: unknown, expected: unknown, label: string) => { assertions += 1; assert.deepEqual(actual, expected, label); };
const externalRequests: string[] = [];
const browserErrors: string[] = [];
const consoleErrors: string[] = [];
const screenshots: string[] = [];
const durations: number[] = [];
const performanceReceipts: Array<{ scenario: string; elapsedMs: number; usedJsHeapBytes: number | null }> = [];

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: !process.argv.includes("--headed"),
  args: ["--disable-background-networking", "--disable-component-update", "--disable-sync", "--disable-extensions", "--no-first-run"],
});

const createContext = async (width = 1440, height = 900) => {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
  await context.addInitScript(() => {
    try {
      localStorage.setItem("da_welcome_seen", "1");
      localStorage.setItem("da_welcome_never_show", "1");
    } catch {}
  });
  await context.route("**/*", async route => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin === origin || requestUrl.protocol === "data:" || requestUrl.protocol === "blob:") {
      await route.continue();
      return;
    }
    externalRequests.push(route.request().url());
    await route.abort("blockedbyclient");
  });
  return context;
};

const observe = (page: Page) => {
  page.on("pageerror", error => browserErrors.push(error.message));
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
};

const deleteDatabase = (page: Page, name: string) => page.evaluate(databaseName => new Promise<void>((resolve, reject) => {
  const request = indexedDB.deleteDatabase(databaseName);
  request.onsuccess = () => resolve();
  request.onerror = () => reject(request.error);
  request.onblocked = () => reject(new Error(`blocked:${databaseName}`));
}), name);

const openWorkspace = async (context: BrowserContext, clean = false) => {
  const page = await context.newPage();
  observe(page);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  if (clean) {
    await deleteDatabase(page, "diamond-animation-project-recovery-v1");
    await deleteDatabase(page, "diamond-animation-unified-v2");
    await page.reload({ waitUntil: "domcontentloaded" });
  }
  const dismissWelcome = page.getByRole("button", { name: "Don't show again" });
  if (await dismissWelcome.isVisible().catch(() => false)) await dismissWelcome.click({ force: true });
  const newProject = page.getByRole("button", { name: /New Project Create a new project/ });
  await newProject.click();
  try {
    await page.getByRole("button", { name: "File" }).waitFor({ timeout: 12_000 });
  } catch (error) {
    if (await newProject.isVisible().catch(() => false)) {
      await newProject.click();
      await page.getByRole("button", { name: "File" }).waitFor({ timeout: 12_000 });
    } else {
      console.error(JSON.stringify({ url: page.url(), body: (await page.locator("body").innerText()).slice(0, 3_000), browserErrors, consoleErrors }));
      throw error;
    }
  }
  return page;
};

type StorageState = {
  recoveryDatabaseExists: boolean;
  head: null | { draftSequence: number; workspaceGeneration: number; candidateDigest: string; status: string; sourceProjectId: string; sourceRevision: number };
  candidates: number;
  recoveryAssets: number;
  officialHeads: number;
  officialVersions: number;
};

const readStorage = (page: Page) => page.evaluate(async (): Promise<StorageState> => {
  const databaseNames = new Set((await indexedDB.databases()).map(database => database.name));
  const read = async (name: string, stores: string[]) => {
    if (!databaseNames.has(name)) return null;
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const existing = stores.filter(store => db.objectStoreNames.contains(store));
      if (!existing.length) return Object.fromEntries(stores.map(store => [store, []]));
      const transaction = db.transaction(existing, "readonly");
      const result: Record<string, unknown[]> = {};
      await Promise.all(existing.map(store => new Promise<void>((resolve, reject) => {
        const request = transaction.objectStore(store).getAll();
        request.onsuccess = () => { result[store] = request.result; resolve(); };
        request.onerror = () => reject(request.error);
      })));
      return result;
    } finally { db.close(); }
  };
  const recovery = await read("diamond-animation-project-recovery-v1", ["heads", "candidates", "assets"]);
  const official = await read("diamond-animation-unified-v2", ["heads", "versions"]);
  return {
    recoveryDatabaseExists: databaseNames.has("diamond-animation-project-recovery-v1"),
    head: (recovery?.heads?.[0] as StorageState["head"]) ?? null,
    candidates: recovery?.candidates?.length ?? 0,
    recoveryAssets: recovery?.assets?.length ?? 0,
    officialHeads: official?.heads?.length ?? 0,
    officialVersions: official?.versions?.length ?? 0,
  };
});

const waitForRecoveryState = async (page: Page, state: string) => {
  await page.locator(`[data-project-recovery-state="${state}"]`).waitFor({ state: "visible", timeout: 12_000 });
};
const setFps = async (page: Page, value: string) => {
  const fps = page.getByRole("spinbutton", { name: "FPS" });
  await fps.fill(value);
  await fps.press("Tab");
};
const openFileMenu = async (page: Page) => {
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menu").waitFor();
};

try {
  const context = await createContext();
  const page = await openWorkspace(context, true);
  await waitForRecoveryState(page, "idle");
  await page.waitForTimeout(1_100);
  equal((await readStorage(page)).recoveryDatabaseExists, false, "untouched New creates no recovery database");

  await page.getByRole("button", { name: "Brush" }).click();
  await page.getByRole("button", { name: "Onion" }).click();
  await page.getByRole("button", { name: "Play" }).click();
  await page.getByRole("button", { name: "Pause" }).click();
  await page.getByRole("button", { name: "Timeline cell, frame 1" }).click();
  await page.waitForTimeout(1_100);
  equal((await readStorage(page)).recoveryDatabaseExists, false, "tool, onion, playback, and navigation actions create no draft");

  const startedAt = performance.now();
  await setFps(page, "18");
  await waitForRecoveryState(page, "current");
  durations.push(Math.round((performance.now() - startedAt) * 100) / 100);
  let state = await readStorage(page);
  equal(state.head?.status, "current", "meaningful edit publishes one current recovery head");
  equal(state.candidates, 1, "one candidate is retained");
  equal(state.officialHeads, 0, "recovery edit creates no official project head");
  const firstHead = structuredClone(state.head);

  await setFps(page, "19");
  await page.waitForTimeout(100);
  await setFps(page, "20");
  await page.waitForTimeout(100);
  await setFps(page, "21");
  await waitForRecoveryState(page, "current");
  state = await readStorage(page);
  check((state.head?.draftSequence ?? 0) > (firstHead?.draftSequence ?? 0), "burst publishes a newer sequence");
  equal(state.candidates, 1, "burst collapses to one retained candidate");

  const rasterStartedAt = performance.now();
  await page.getByRole("button", { name: "Fill" }).click();
  const canvasBounds = await page.locator('canvas[data-workspace-canvas="editable"]').boundingBox();
  check(canvasBounds, "editable canvas is visible for the persisted raster fixture");
  await page.mouse.click(canvasBounds!.x + canvasBounds!.width / 2, canvasBounds!.y + canvasBounds!.height / 2);
  await page.locator('[data-project-recovery-state="pending"], [data-project-recovery-state="writing"]').first().waitFor({ state: "visible" });
  await waitForRecoveryState(page, "current");
  const rasterElapsedMs = Math.round((performance.now() - rasterStartedAt) * 100) / 100;
  const usedJsHeapBytes = await page.evaluate(() => {
    const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    return memory?.usedJSHeapSize ?? null;
  });
  performanceReceipts.push({ scenario: "full-stage-fill-raster", elapsedMs: rasterElapsedMs, usedJsHeapBytes });
  state = await readStorage(page);
  check(state.recoveryAssets > 0, "committed full-stage raster is stored as a content-addressed recovery asset");
  check(rasterElapsedMs < 15_000, "large raster preparation, write, and readback duration is bounded and recorded");
  check(usedJsHeapBytes === null || usedJsHeapBytes <= 536_870_912, "large raster browser heap stays at or below 512 MiB");

  const secondPage = await openWorkspace(context);
  await waitForRecoveryState(secondPage, "blocked");
  const beforeForeignEdit = await readStorage(secondPage);
  await setFps(secondPage, "30");
  await secondPage.waitForTimeout(1_100);
  equal((await readStorage(secondPage)).head?.candidateDigest, beforeForeignEdit.head?.candidateDigest, "a second workspace cannot replace the existing draft");
  await secondPage.close();

  await page.evaluate(() => {
    const originalPut = IDBObjectStore.prototype.put;
    let failNextHead = true;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore["put"]>) {
      if (failNextHead && this.transaction.db.name === "diamond-animation-project-recovery-v1" && this.name === "heads") {
        failNextHead = false;
        throw new DOMException("Injected recovery publication failure", "QuotaExceededError");
      }
      return originalPut.apply(this, args);
    };
  });
  const beforeFault = await readStorage(page);
  await setFps(page, "22");
  await waitForRecoveryState(page, "failed");
  const afterFault = await readStorage(page);
  equal(afterFault.head?.candidateDigest, beforeFault.head?.candidateDigest, "failed replacement preserves the preceding valid draft");
  equal(afterFault.officialHeads, 0, "recovery failure does not write the official repository");

  await setFps(page, "23");
  await waitForRecoveryState(page, "current");
  state = await readStorage(page);
  equal(state.candidates, 1, "retry cleans the failed staged generation");
  const screenshot = `${screenshotRoot}/desktop-recovery-current.png`;
  await page.screenshot({ path: screenshot });
  screenshots.push(screenshot);

  await openFileMenu(page);
  await page.getByRole("menuitem", { name: "Save", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Saved on this browser" }).waitFor();
  await waitForRecoveryState(page, "idle");
  state = await readStorage(page);
  equal(state.head, null, "official Save clears the exact covered recovery draft");
  equal(state.officialHeads, 1, "official Save still publishes exactly one project head");

  await setFps(page, "24");
  await waitForRecoveryState(page, "current");
  await openFileMenu(page);
  await page.getByRole("menuitem", { name: "Save As" }).click();
  const dialog = page.getByRole("dialog", { name: "Save project as" });
  await dialog.getByRole("textbox", { name: "Project name" }).fill("Recovery Copy");
  await dialog.getByRole("button", { name: "Save copy" }).click();
  await dialog.waitFor({ state: "hidden" });
  await waitForRecoveryState(page, "idle");
  state = await readStorage(page);
  equal(state.head, null, "Save As clears only its exactly covered draft");
  equal(state.officialHeads, 2, "Save As creates a separate official project");

  await setFps(page, "25");
  await waitForRecoveryState(page, "current");
  await setFps(page, "26");
  await waitForRecoveryState(page, "pending");
  const beforeSaveAndExit = await readStorage(page);
  await openFileMenu(page);
  await page.getByRole("menuitem", { name: "Save and Exit" }).click();
  await page.getByRole("button", { name: /New Project Create a new project/ }).waitFor();
  state = await readStorage(page);
  equal(state.head, null, "one Save and Exit activation publishes and clears the exact pending recovery generation before Home");
  equal(state.officialHeads, 2, "Save and Exit updates the current official project without creating another");
  equal(state.officialVersions, beforeSaveAndExit.officialVersions + 1, "rapid pending-draft Save and Exit performs exactly one official write");

  const compact = await openWorkspace(context);
  await waitForRecoveryState(compact, "idle");
  const compactScreenshot = `${screenshotRoot}/compact-recovery-ready.png`;
  await compact.setViewportSize({ width: 600, height: 700 });
  await compact.screenshot({ path: compactScreenshot });
  screenshots.push(compactScreenshot);
  check(await compact.getByRole("textbox", { name: "Message AI Animator" }).isVisible(), "Terra panel remains present and unchanged");
  await compact.close();
  await context.close();
} finally {
  await browser.close();
}

equal(externalRequests, [], "zero non-loopback or external requests");
equal(browserErrors, [], "zero page errors");
equal(consoleErrors, [], "zero console errors");
check(durations.length === 1 && durations[0] <= 3_000, "representative draft verifies within three seconds");

const result = {
  kind: "spec0010-phase2-browser-proof",
  version: 1,
  status: "PASS",
  assertions,
  scenarios: [
    "untouched-and-transient-no-draft",
    "meaningful-edit-and-burst-latest-draft",
    "second-workspace-conflict",
    "publication-fault-preserves-last-good",
    "official-save-exact-clear",
    "save-as-exact-clear",
    "save-and-exit-pending-draft-one-click",
    "compact-and-terra-regression",
  ],
  durationsMs: durations,
  performanceReceipts,
  screenshots,
  network: { externalRequests, providerRequests: 0, aiCalls: 0, paidCalls: 0, creditChanges: 0 },
  errors: { page: browserErrors, console: consoleErrors },
};
writeFileSync(`${outputRoot}/browser.json`, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
