import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type BrowserContext, type Page } from "playwright-core";

const url = process.argv.find(argument => argument.startsWith("--url="))?.slice(6) ?? "http://127.0.0.1:57610/";
assert.match(url, /^http:\/\/127\.0\.0\.1:[0-9]+\/$/);
const origin = new URL(url).origin;
const outputRoot = "output/spec-0010/phase-1";
const screenshotRoot = `${outputRoot}/screenshots`;
mkdirSync(screenshotRoot, { recursive: true });

let assertions = 0;
const check = (value: unknown, label: string) => {
  assertions += 1;
  assert.ok(value, label);
};
const equal = (actual: unknown, expected: unknown, label: string) => {
  assertions += 1;
  assert.deepEqual(actual, expected, label);
};

type StorageReceipt = {
  heads: Array<{ projectId: string; activeRevision: number; activeProjectDigest: string; title: string }>;
  versions: number;
};

type TestCounters = {
  digestCalls: number;
  headPuts: number;
  readwriteTransactions: number;
  digestMode: "normal" | "reject-next" | "block-next" | "blocked";
  releaseDigest: null | (() => void);
};

const externalRequests: string[] = [];
const browserErrors: string[] = [];
const consoleErrors: string[] = [];
const screenshots: string[] = [];

const createContext = async (options: { width?: number; height?: number; reducedMotion?: "reduce" | "no-preference" } = {}) => {
  const context = await browser.newContext({
    viewport: { width: options.width ?? 1440, height: options.height ?? 900 },
    reducedMotion: options.reducedMotion ?? "no-preference",
  });
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

const observePage = (page: Page) => {
  page.on("pageerror", error => browserErrors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
};

const openWorkspace = async (context: BrowserContext) => {
  const page = await context.newPage();
  observePage(page);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(750);
  await page.getByRole("button", { name: /New Project Create a new project/ }).click();
  try {
    await page.getByRole("button", { name: "File" }).waitFor();
  } catch (error) {
    console.error(JSON.stringify({
      url: page.url(),
      body: (await page.locator("body").innerText()).slice(0, 2_000),
      browserErrors,
      consoleErrors,
    }));
    throw error;
  }
  return page;
};

const setFps = async (page: Page, value: string) => {
  const fps = page.getByRole("spinbutton", { name: "FPS" });
  await fps.fill(value);
  await fps.press("Tab");
  await page.waitForFunction(expected => document.querySelector('[role="status"]')?.textContent?.includes(expected), "Unsaved changes");
};

const installSaveObserver = async (page: Page) => {
  await page.evaluate(() => {
    const counters: TestCounters = {
      digestCalls: 0,
      headPuts: 0,
      readwriteTransactions: 0,
      digestMode: "normal",
      releaseDigest: null,
    };
    Object.defineProperty(window, "__spec0010Phase1", { value: counters, configurable: true });

    const originalTransaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args: Parameters<IDBDatabase["transaction"]>) {
      const transaction = originalTransaction.apply(this, args);
      if (this.name === "diamond-animation-unified-v2" && args[1] === "readwrite") counters.readwriteTransactions += 1;
      return transaction;
    };

    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore["put"]>) {
      if (this.transaction.db.name === "diamond-animation-unified-v2" && this.name === "heads") counters.headPuts += 1;
      return originalPut.apply(this, args);
    };

    const originalDigest = SubtleCrypto.prototype.digest;
    SubtleCrypto.prototype.digest = function (...args: Parameters<SubtleCrypto["digest"]>) {
      counters.digestCalls += 1;
      if (counters.digestMode === "reject-next") {
        counters.digestMode = "normal";
        return Promise.reject(new DOMException("Injected Phase 1 hash failure", "OperationError"));
      }
      if (counters.digestMode === "block-next") {
        counters.digestMode = "blocked";
        return new Promise<ArrayBuffer>((resolve, reject) => {
          counters.releaseDigest = () => {
            counters.releaseDigest = null;
            counters.digestMode = "normal";
            originalDigest.apply(this, args).then(resolve, reject);
          };
        });
      }
      return originalDigest.apply(this, args);
    };
  });
};

const counters = (page: Page) => page.evaluate(() => {
  const current = (window as unknown as { __spec0010Phase1: TestCounters }).__spec0010Phase1;
  return {
    digestCalls: current.digestCalls,
    headPuts: current.headPuts,
    readwriteTransactions: current.readwriteTransactions,
    digestMode: current.digestMode,
  };
});

const setDigestMode = (page: Page, mode: TestCounters["digestMode"]) => page.evaluate(nextMode => {
  (window as unknown as { __spec0010Phase1: TestCounters }).__spec0010Phase1.digestMode = nextMode;
}, mode);

const releaseDigest = (page: Page) => page.evaluate(() => {
  const current = (window as unknown as { __spec0010Phase1: TestCounters }).__spec0010Phase1;
  current.releaseDigest?.();
});

const readStorage = (page: Page): Promise<StorageReceipt> => page.evaluate(async () => {
  const databases = await indexedDB.databases();
  if (!databases.some(database => database.name === "diamond-animation-unified-v2")) return { heads: [], versions: 0 };
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("diamond-animation-unified-v2");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    const transaction = database.transaction(["heads", "versions"], "readonly");
    const heads = await new Promise<StorageReceipt["heads"]>((resolve, reject) => {
      const request = transaction.objectStore("heads").getAll();
      request.onsuccess = () => resolve(request.result as StorageReceipt["heads"]);
      request.onerror = () => reject(request.error);
    });
    const versions = await new Promise<number>((resolve, reject) => {
      const request = transaction.objectStore("versions").count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return { heads, versions };
  } finally {
    database.close();
  }
});

const openFileMenu = async (page: Page) => {
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menu").waitFor();
};

const saveAndExitItems = ["Save", "Save As", "Export…", "Save and Exit"];

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: !process.argv.includes("--headed"),
  args: ["--disable-background-networking", "--disable-component-update", "--disable-sync", "--disable-extensions", "--no-first-run"],
});

try {
  {
    const context = await createContext();
    const page = await openWorkspace(context);
    await installSaveObserver(page);
    await setFps(page, "17");
    await openFileMenu(page);
    equal(await page.getByRole("menuitem").allTextContents(), saveAndExitItems, "Save and Exit is the final File item");
    const successMenuScreenshot = `${screenshotRoot}/desktop-save-and-exit-menu.png`;
    await page.screenshot({ path: successMenuScreenshot });
    screenshots.push(successMenuScreenshot);
    const saveAndExit = page.getByRole("menuitem", { name: "Save and Exit" });
    await saveAndExit.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: /New Project Create a new project/ }).waitFor();
    check((await page.evaluate(() => document.activeElement?.textContent ?? "")).includes("New Project"), "Home focus returns to New Project");
    equal((await counters(page)).headPuts, 1, "successful Save and Exit publishes one official head");
    const storage = await readStorage(page);
    equal(storage.heads.length, 1, "successful Save and Exit creates one official project head");
    equal(storage.heads[0]?.activeRevision, 1, "first official Save publishes revision one");
    equal(storage.versions, 1, "one immutable official version exists");
    const successHomeScreenshot = `${screenshotRoot}/desktop-save-and-exit-home.png`;
    await page.screenshot({ path: successHomeScreenshot });
    screenshots.push(successHomeScreenshot);
    await context.close();
  }

  {
    const context = await createContext();
    const page = await openWorkspace(context);
    await installSaveObserver(page);
    await setFps(page, "23");
    equal(await readStorage(page), { heads: [], versions: 0 }, "failure fixture starts without official storage");
    await setDigestMode(page, "reject-next");
    await openFileMenu(page);
    await page.getByRole("menuitem", { name: "Save and Exit" }).click();
    await page.getByRole("status").filter({ hasText: "Save failed" }).waitFor();
    check(await page.getByRole("button", { name: "File" }).isVisible(), "hash failure remains in editable workspace");
    equal(await page.getByRole("spinbutton", { name: "FPS" }).inputValue(), "23", "hash failure preserves current editable state");
    equal(await readStorage(page), { heads: [], versions: 0 }, "hash failure publishes no official head or version");
    equal((await counters(page)).headPuts, 0, "hash failure never reaches official head publication");
    const failureScreenshot = `${screenshotRoot}/failure-stays-in-workspace.png`;
    await page.screenshot({ path: failureScreenshot });
    screenshots.push(failureScreenshot);
    await context.close();
  }

  {
    const context = await createContext();
    const page = await openWorkspace(context);
    await installSaveObserver(page);
    await setFps(page, "31");
    await setDigestMode(page, "block-next");
    await openFileMenu(page);
    await page.getByRole("menuitem", { name: "Save and Exit" }).click();
    await page.waitForFunction(() => (window as unknown as { __spec0010Phase1: TestCounters }).__spec0010Phase1.digestMode === "blocked");
    const fps = page.getByRole("spinbutton", { name: "FPS" });
    await fps.fill("32");
    await fps.press("Tab");
    await page.waitForTimeout(50);
    await releaseDigest(page);
    await page.getByRole("status").filter({ hasText: "Unsaved changes" }).waitFor();
    check(await page.getByRole("button", { name: "File" }).isVisible(), "newer edit prevents Home navigation");
    equal(await fps.inputValue(), "32", "newer edit remains editable after stale save success");
    equal((await readStorage(page)).heads[0]?.activeRevision, 1, "captured older generation saves once without exiting");
    const concurrentScreenshot = `${screenshotRoot}/concurrent-edit-remains-unsaved.png`;
    await page.screenshot({ path: concurrentScreenshot });
    screenshots.push(concurrentScreenshot);
    await openFileMenu(page);
    await page.getByRole("menuitem", { name: "Save", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Saved on this browser" }).waitFor();
    equal((await readStorage(page)).heads[0]?.activeRevision, 2, "ordinary Save persists the newer edit afterward");
    await context.close();
  }

  {
    const context = await createContext();
    const page = await openWorkspace(context);
    await installSaveObserver(page);
    await setFps(page, "41");
    await setDigestMode(page, "block-next");
    await openFileMenu(page);
    await page.evaluate(() => {
      const action = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
        .find(button => button.textContent?.trim() === "Save and Exit");
      action?.click();
      action?.click();
    });
    await page.waitForFunction(() => (window as unknown as { __spec0010Phase1: TestCounters }).__spec0010Phase1.digestMode === "blocked");
    await openFileMenu(page);
    check(await page.getByRole("menuitem", { name: "Save", exact: true }).isDisabled(), "Save is disabled during in-flight save");
    check(await page.getByRole("menuitem", { name: "Save As" }).isDisabled(), "Save As is disabled during in-flight save");
    check(await page.getByRole("menuitem", { name: "Save and Exit" }).isDisabled(), "Save and Exit is disabled during in-flight save");
    await releaseDigest(page);
    await page.getByRole("button", { name: /New Project Create a new project/ }).waitFor();
    const duplicateCounters = await counters(page);
    equal(duplicateCounters.headPuts, 1, "rapid double activation publishes one official head");
    equal((await readStorage(page)).heads.length, 1, "rapid double activation creates one official project");
    await context.close();
  }

  {
    const context = await createContext();
    const page = await openWorkspace(context);
    await installSaveObserver(page);
    await page.getByRole("button", { name: "Brush" }).click();
    const canvasBounds = await page.locator('canvas[data-workspace-canvas="editable"]').boundingBox();
    check(canvasBounds, "editable drawing canvas is visible");
    await page.mouse.move(canvasBounds!.x + canvasBounds!.width * 0.45, canvasBounds!.y + canvasBounds!.height * 0.45);
    await page.mouse.down();
    await page.mouse.move(canvasBounds!.x + canvasBounds!.width * 0.55, canvasBounds!.y + canvasBounds!.height * 0.55, { steps: 6 });
    await page.mouse.up();
    await page.getByRole("button", { name: "Undo" }).waitFor({ state: "visible" });
    await page.waitForFunction(() => !(document.querySelector('button[aria-label="Undo"]') as HTMLButtonElement | null)?.disabled);
    await page.getByRole("button", { name: "Undo" }).click();
    await page.waitForFunction(() => !(document.querySelector('button[aria-label="Redo"]') as HTMLButtonElement | null)?.disabled);
    await page.getByRole("button", { name: "Redo" }).click();
    await page.getByRole("button", { name: "+ Layer" }).click();
    await page.getByRole("button", { name: "Onion" }).click();
    await page.getByRole("button", { name: "Play" }).click();
    await page.getByRole("button", { name: "Pause" }).click();
    await openFileMenu(page);
    await page.getByRole("menuitem", { name: "Save", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Saved on this browser" }).waitFor();
    await openFileMenu(page);
    await page.getByRole("menuitem", { name: "Save As" }).click();
    await page.getByRole("dialog", { name: "Save project as" }).waitFor();
    check(await page.getByRole("textbox", { name: "Project name" }).evaluate(element => element === document.activeElement), "Save As still focuses its name field");
    await page.getByRole("button", { name: "Cancel" }).click();
    await openFileMenu(page);
    await page.getByRole("menuitem", { name: "Export…" }).click();
    await page.getByRole("main", { name: "Choose a saved animation to export" }).waitFor();
    await page.getByRole("button", { name: "← Back" }).click();
    await page.getByRole("button", { name: "File" }).waitFor();
    await page.getByRole("button", { name: "Fill" }).click();
    await page.getByRole("button", { name: "Eraser" }).click();
    check(await page.getByRole("textbox", { name: "Message AI Animator" }).isVisible(), "Terra panel remains mounted and unchanged");
    equal((await counters(page)).headPuts, 1, "ordinary Save regression performs one official publication");
    const regressionScreenshot = `${screenshotRoot}/protected-workspace-regressions.png`;
    await page.screenshot({ path: regressionScreenshot });
    screenshots.push(regressionScreenshot);
    await context.close();
  }

  {
    const context = await createContext({ width: 600, height: 700, reducedMotion: "reduce" });
    const page = await openWorkspace(context);
    await page.getByRole("button", { name: "File" }).focus();
    await page.keyboard.press("Enter");
    equal(await page.getByRole("menuitem").allTextContents(), saveAndExitItems, "compact reduced-motion menu retains final Save and Exit action");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    equal((await page.evaluate(() => document.activeElement?.textContent?.trim())), "Save and Exit", "keyboard tab order reaches Save and Exit");
    const compactScreenshot = `${screenshotRoot}/compact-reduced-motion-menu.png`;
    await page.screenshot({ path: compactScreenshot });
    screenshots.push(compactScreenshot);
    await context.close();
  }
} finally {
  await browser.close();
}

equal(externalRequests, [], "zero non-loopback or external requests");
equal(browserErrors, [], "zero page errors");
equal(consoleErrors, [], "zero console errors");

const result = {
  kind: "spec0010-phase1-browser-proof",
  version: 1,
  status: "PASS",
  assertions,
  scenarios: [
    "keyboard-success-current-generation",
    "injected-hash-failure",
    "edit-during-save",
    "rapid-double-activation",
    "protected-workspace-regressions",
    "compact-reduced-motion-keyboard",
  ],
  screenshots,
  network: { externalRequests, providerRequests: 0, aiCalls: 0, paidCalls: 0, creditChanges: 0 },
  errors: { page: browserErrors, console: consoleErrors },
};

writeFileSync(`${outputRoot}/browser.json`, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
