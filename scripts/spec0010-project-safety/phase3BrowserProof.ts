import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type BrowserContext, type Page } from "playwright-core";

const url = process.argv.find(argument => argument.startsWith("--url="))?.slice(6) ?? "http://127.0.0.1:57630/";
assert.match(url, /^http:\/\/127\.0\.0\.1:[0-9]+\/$/);
const origin = new URL(url).origin;
const outputRoot = "output/spec-0010/phase-3";
const screenshotRoot = `${outputRoot}/screenshots`;
mkdirSync(screenshotRoot, { recursive: true });

let assertions = 0;
const check = (value: unknown, label: string) => { assertions += 1; assert.ok(value, label); };
const equal = (actual: unknown, expected: unknown, label: string) => { assertions += 1; assert.deepEqual(actual, expected, label); };
const externalRequests: string[] = [];
const browserErrors: string[] = [];
const consoleErrors: string[] = [];
const screenshots: string[] = [];
const performanceReceipts: Array<{ scenario: string; elapsedMs: number; usedJsHeapBytes: number | null }> = [];

type StorageState = {
  recoveryHead: null | {
    ownerSessionId: string;
    workspaceInstanceId: string;
    sourceProjectId: string;
    sourceRevision: number;
    sourceTitle: string;
    draftSequence: number;
    workspaceGeneration: number;
    candidateDigest: string;
    lastMeaningfulEditAt: string;
    status: string;
  };
  recoveryCandidates: number;
  recoveryAssets: number;
  officialHeads: Array<{ projectId: string; title: string; activeRevision: number; projectDigest: string }>;
  officialVersions: number;
};

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
    recoveryHead: (recovery?.heads?.[0] as StorageState["recoveryHead"]) ?? null,
    recoveryCandidates: recovery?.candidates?.length ?? 0,
    recoveryAssets: recovery?.assets?.length ?? 0,
    officialHeads: (official?.heads as StorageState["officialHeads"]) ?? [],
    officialVersions: official?.versions?.length ?? 0,
  };
});

const cleanHome = async (context: BrowserContext) => {
  const page = await context.newPage();
  observe(page);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await deleteDatabase(page, "diamond-animation-project-recovery-v1");
  await deleteDatabase(page, "diamond-animation-unified-v2");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /New Project Create a new project/ }).waitFor({ timeout: 12_000 });
  return page;
};

const openWorkspace = async (page: Page) => {
  await page.getByRole("button", { name: /New Project Create a new project/ }).click();
  await page.getByRole("button", { name: "File" }).waitFor({ timeout: 12_000 });
};

const openFileMenu = async (page: Page) => {
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menu").waitFor();
};

const setFps = async (page: Page, value: string) => {
  const fps = page.getByRole("spinbutton", { name: "FPS" });
  await fps.fill(value);
  await fps.press("Tab");
};

const waitRecovery = async (page: Page, state: string) => {
  try {
    await page.locator(`[data-project-recovery-state="${state}"]`).waitFor({ state: "visible", timeout: 15_000 });
  } catch (error) {
    const actual = await page.locator("[data-project-recovery-state]").getAttribute("data-project-recovery-state");
    const storage = await readStorage(page);
    throw new Error(`Expected recovery state ${state}; saw ${String(actual)} with storage ${JSON.stringify(storage)}`, { cause: error });
  }
};

const save = async (page: Page) => {
  await openFileMenu(page);
  await page.getByRole("menuitem", { name: "Save", exact: true }).click();
  await page.getByText("Project saved", { exact: true }).waitFor({ timeout: 15_000 });
  await page.getByRole("status").filter({ hasText: "Saved on this browser" }).waitFor({ timeout: 15_000 });
  await waitRecovery(page, "idle");
};

const reloadToPrompt = async (page: Page, mode: "valid" | "invalid" = "valid") => {
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(`[data-project-recovery-prompt="${mode}"]`).waitFor({ state: "visible", timeout: 15_000 });
};

const confirmDiscard = async (page: Page) => {
  await page.getByRole("button", { name: "Discard Draft" }).click();
  await page.getByText("Discard this local safety backup?", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Discard Draft" }).click();
};

try {
  {
    const context = await createContext();
    const page = await cleanHome(context);
    const startedAt = performance.now();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /New Project Create a new project/ }).waitFor({ timeout: 12_000 });
    performanceReceipts.push({
      scenario: "no-draft-startup",
      elapsedMs: Math.round((performance.now() - startedAt) * 100) / 100,
      usedJsHeapBytes: await page.evaluate(() => (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null),
    });
    equal(await page.locator('[data-project-recovery-prompt="valid"], [data-project-recovery-prompt="invalid"]').count(), 0, "no-draft startup reaches unchanged Home without a decision prompt");
    equal((await readStorage(page)).recoveryHead, null, "no-draft startup creates no recovery head");
    const screenshot = `${screenshotRoot}/no-draft-home.png`;
    await page.screenshot({ path: screenshot }); screenshots.push(screenshot);
    await context.close();
  }

  {
    const context = await createContext();
    const page = await cleanHome(context);
    await openWorkspace(page);
    await save(page);
    const officialBefore = await readStorage(page);
    await setFps(page, "18");
    await page.getByRole("button", { name: "+ Layer" }).click();
    await page.getByRole("button", { name: "Fill" }).click();
    const canvasBounds = await page.locator('canvas[data-workspace-canvas="editable"]').boundingBox();
    check(canvasBounds, "matching-source fixture has an editable canvas");
    await page.mouse.click(canvasBounds!.x + canvasBounds!.width / 2, canvasBounds!.y + canvasBounds!.height / 2);
    await waitRecovery(page, "current");
    const draftBeforeReload = await readStorage(page);
    check(draftBeforeReload.recoveryHead?.lastMeaningfulEditAt, "valid draft records a recovery time");
    await reloadToPrompt(page);
    check(await page.getByRole("heading", { name: "Unsaved work found" }).isVisible(), "valid startup shows the recovery decision surface");
    check(await page.getByText("Untitled Project", { exact: true }).isVisible(), "prompt shows the project name");
    check(!(await page.locator("body").innerText()).includes("Unknown time"), "prompt shows a clear local recovery time");
    check(await page.getByRole("button", { name: "Recover Work" }).isEnabled(), "valid draft enables Recover Work");
    check(await page.getByRole("button", { name: "Discard Draft" }).isEnabled(), "valid draft retains Discard Draft");
    const promptScreenshot = `${screenshotRoot}/valid-recovery-prompt.png`;
    await page.screenshot({ path: promptScreenshot }); screenshots.push(promptScreenshot);
    await page.getByRole("button", { name: "Recover Work" }).click();
    await page.getByRole("button", { name: "File" }).waitFor({ timeout: 15_000 });
    equal(await page.getByRole("spinbutton", { name: "FPS" }).inputValue(), "18", "Recover Work restores the exact persisted FPS");
    equal(await page.locator('[data-timeline-panel="overlay"]').count(), 1, "Recover Work restores the added layer into the mounted timeline");
    const restoredAlpha = await page.locator('canvas[data-workspace-canvas="editable"]').evaluate((canvas: HTMLCanvasElement) =>
      canvas.getContext("2d")!.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data[3]);
    check(restoredAlpha > 0, "Recover Work restores the committed raster content");
    const beforeExplicitSave = await readStorage(page);
    equal(beforeExplicitSave.officialHeads, officialBefore.officialHeads, "recovering writes zero official head bytes before explicit Save");
    equal(beforeExplicitSave.officialVersions, officialBefore.officialVersions, "recovering writes zero official version bytes before explicit Save");

    for (const tool of ["Select", "Lasso", "Brush", "Eraser", "Fill", "Text", "Shape", "Knife"]) {
      check(await page.getByRole("button", { name: tool, exact: true }).isVisible(), `${tool} remains available after recovery`);
    }
    await page.getByRole("button", { name: "Library", exact: true }).click();
    await page.getByRole("button", { name: "Assets", exact: true }).click();
    await page.getByRole("button", { name: "Properties", exact: true }).click();
    await page.getByRole("button", { name: "Onion", exact: true }).click();
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await page.getByRole("button", { name: "Play", exact: true }).waitFor();
    check(await page.getByRole("textbox", { name: "Message AI Animator" }).isVisible(), "Terra conversation remains mounted without making a call");
    await page.getByRole("textbox", { name: "Message AI Animator" }).fill("Local recovery regression check");
    await save(page);
    const afterSave = await readStorage(page);
    equal(afterSave.recoveryHead, null, "matching-source Save clears the exact claimed draft");
    equal(afterSave.officialHeads[0]?.activeRevision, 2, "matching-source Save publishes the expected next official revision");
    equal(afterSave.officialVersions, officialBefore.officialVersions + 1, "matching-source Save adds exactly one official version");

    await openFileMenu(page);
    await page.getByRole("menuitem", { name: "Save As" }).click();
    const saveAsDialog = page.getByRole("dialog", { name: "Save project as" });
    await saveAsDialog.getByRole("textbox", { name: "Project name" }).fill("Recovered Safety Copy");
    await saveAsDialog.getByRole("button", { name: "Save copy" }).click();
    await saveAsDialog.waitFor({ state: "hidden" });
    equal((await readStorage(page)).officialHeads.length, 2, "Save As still creates a separate official project");
    await openFileMenu(page);
    await page.getByRole("menuitem", { name: "Export…" }).click();
    await page.getByRole("main", { name: "Choose a saved animation to export" }).waitFor();
    await page.getByRole("button", { name: "← Back" }).click();
    await page.getByRole("button", { name: "File" }).waitFor();
    await openFileMenu(page);
    await page.getByRole("menuitem", { name: "Save and Exit" }).click();
    await page.getByRole("button", { name: /New Project Create a new project/ }).waitFor({ timeout: 15_000 });
    await page.getByRole("button", { name: /Open Project Open an existing project/ }).click();
    await page.getByRole("main", { name: "Projects" }).waitFor();
    await page.getByRole("button", { name: "Open Recovered Safety Copy" }).click();
    await page.getByRole("button", { name: "File" }).waitFor({ timeout: 15_000 });
    equal(await page.getByRole("spinbutton", { name: "FPS" }).inputValue(), "18", "Open still rehydrates the saved recovered project");
    const screenshot = `${screenshotRoot}/matching-source-recovered-workspace.png`;
    await page.screenshot({ path: screenshot }); screenshots.push(screenshot);
    await context.close();
  }

  {
    const context = await createContext();
    const page = await cleanHome(context);
    await openWorkspace(page);
    await setFps(page, "33");
    await waitRecovery(page, "current");
    const before = await readStorage(page);
    const originalSourceId = before.recoveryHead?.sourceProjectId;
    await reloadToPrompt(page);
    await page.getByRole("button", { name: "Recover Work" }).click();
    await page.getByRole("button", { name: "File" }).waitFor({ timeout: 15_000 });
    check(await page.getByText(/Recovered copy/, { exact: false }).count(), "missing-source recovery is visibly a Recovered copy");
    equal((await readStorage(page)).officialHeads.length, 0, "detached recovery writes no official project before Save");
    await save(page);
    const after = await readStorage(page);
    equal(after.officialHeads.length, 1, "detached recovery Save creates one separate official project");
    check(after.officialHeads[0]?.projectId !== originalSourceId, "detached Save uses a new project identity");
    equal(after.officialHeads[0]?.activeRevision, 1, "detached Save creates revision one instead of overwriting a source");
    equal(after.recoveryHead, null, "detached Save clears its exact rebound recovery draft");
    await context.close();
  }

  {
    const context = await createContext();
    const page = await cleanHome(context);
    await openWorkspace(page);
    await save(page);
    await setFps(page, "27");
    await waitRecovery(page, "current");
    const officialBeforeDiscard = (await readStorage(page)).officialHeads;
    await reloadToPrompt(page);
    await page.getByRole("button", { name: "Discard Draft" }).click();
    await page.getByText("Discard this local safety backup?", { exact: true }).waitFor();
    check((await readStorage(page)).recoveryHead, "first discard activation only asks for confirmation");
    await page.getByRole("button", { name: "Cancel" }).click();
    check((await readStorage(page)).recoveryHead, "cancelling discard retains the draft");
    await confirmDiscard(page);
    await page.getByRole("button", { name: /New Project Create a new project/ }).waitFor();
    const afterDiscard = await readStorage(page);
    equal(afterDiscard.recoveryHead, null, "confirmed discard verifies recovery absence");
    equal(afterDiscard.officialHeads, officialBeforeDiscard, "discard never deletes or changes the official project");
    await context.close();
  }

  {
    const context = await createContext();
    const page = await cleanHome(context);
    await openWorkspace(page);
    await setFps(page, "29");
    await waitRecovery(page, "current");
    await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("diamond-animation-project-recovery-v1");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const transaction = db.transaction("heads", "readwrite");
      const store = transaction.objectStore("heads");
      const head = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const request = store.get("latest"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      store.put({ ...head, candidateDigest: "0".repeat(64) });
      await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
      db.close();
    });
    await reloadToPrompt(page, "invalid");
    check(await page.getByRole("button", { name: "Recover Work" }).isDisabled(), "corrupt draft disables Recover Work");
    check(await page.getByRole("button", { name: "Discard Draft" }).isEnabled(), "corrupt draft retains Discard Draft");
    await confirmDiscard(page);
    await page.getByRole("button", { name: /New Project Create a new project/ }).waitFor();
    equal((await readStorage(page)).recoveryHead, null, "corrupt draft can be explicitly discarded without broad deletion");
    await context.close();
  }

  {
    const context = await createContext();
    const page = await cleanHome(context);
    await openWorkspace(page);
    await setFps(page, "18");
    await waitRecovery(page, "current");
    await page.evaluate(() => {
      const originalPut = IDBObjectStore.prototype.put;
      let failNextRecoveryHead = true;
      IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore["put"]>) {
        if (failNextRecoveryHead && this.transaction.db.name === "diamond-animation-project-recovery-v1" && this.name === "heads") {
          failNextRecoveryHead = false;
          throw new DOMException("Injected quota failure", "QuotaExceededError");
        }
        return originalPut.apply(this, args);
      };
    });
    await setFps(page, "19");
    await waitRecovery(page, "failed");
    await reloadToPrompt(page);
    await page.getByRole("button", { name: "Recover Work" }).click();
    await page.getByRole("button", { name: "File" }).waitFor({ timeout: 15_000 });
    equal(await page.getByRole("spinbutton", { name: "FPS" }).inputValue(), "18", "quota failure preserves and recovers the preceding verified draft");
    await context.close();
  }

  {
    const context = await createContext();
    const first = await cleanHome(context);
    await openWorkspace(first);
    await setFps(first, "31");
    await waitRecovery(first, "current");
    await reloadToPrompt(first);
    const second = await context.newPage(); observe(second);
    await second.goto(url, { waitUntil: "domcontentloaded" });
    await second.locator('[data-project-recovery-prompt="valid"]').waitFor({ timeout: 15_000 });
    await Promise.all([
      first.getByRole("button", { name: "Recover Work" }).click(),
      second.getByRole("button", { name: "Recover Work" }).click(),
    ]);
    await first.waitForTimeout(2_000);
    const firstOpened = await first.getByRole("button", { name: "File" }).isVisible().catch(() => false);
    const secondOpened = await second.getByRole("button", { name: "File" }).isVisible().catch(() => false);
    equal(Number(firstOpened) + Number(secondOpened), 1, "simultaneous tabs cannot both claim and mount the same draft");
    const loser = firstOpened ? second : first;
    check(await loser.getByRole("heading", { name: "Unsaved work found" }).isVisible(), "losing tab remains on the recovery decision surface");
    equal((await readStorage(loser)).officialHeads.length, 0, "concurrent recovery claims write no official project");
    await context.close();
  }

  {
    const context = await createContext();
    const page = await cleanHome(context);
    await openWorkspace(page);
    await setFps(page, "35");
    await waitRecovery(page, "current");
    await reloadToPrompt(page);
    await page.evaluate(() => {
      const originalClear = IDBObjectStore.prototype.clear;
      IDBObjectStore.prototype.clear = function (...args: Parameters<IDBObjectStore["clear"]>) {
        if (this.transaction.db.name === "diamond-animation-project-recovery-v1") throw new DOMException("Injected discard failure", "QuotaExceededError");
        return originalClear.apply(this, args);
      };
    });
    await confirmDiscard(page);
    const continueHome = page.getByRole("button", { name: "Continue to Home without deleting" });
    await continueHome.waitFor();
    check((await readStorage(page)).recoveryHead, "failed discard preserves the exact recovery draft");
    await continueHome.click();
    await page.getByRole("button", { name: /New Project Create a new project/ }).waitFor();
    check((await readStorage(page)).recoveryHead, "Continue Home does not falsely delete the unavailable draft");
    await context.close();
  }

  {
    const context = await createContext(600, 700);
    const page = await cleanHome(context);
    await openWorkspace(page);
    await setFps(page, "37");
    await waitRecovery(page, "current");
    await reloadToPrompt(page);
    const prompt = page.locator('[data-project-recovery-prompt="valid"]');
    const overflow = await prompt.evaluate(element => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
    check(overflow.scrollWidth <= overflow.clientWidth, "compact recovery prompt has no horizontal overflow");
    check(await page.getByRole("button", { name: "Recover Work" }).evaluate(element => element === document.activeElement), "compact prompt gives initial keyboard focus to Recover Work");
    await page.keyboard.press("Tab");
    check(await page.getByRole("button", { name: "Discard Draft" }).evaluate(element => element === document.activeElement), "compact prompt keyboard order reaches Discard Draft");
    const screenshot = `${screenshotRoot}/compact-reduced-motion-prompt.png`;
    await page.screenshot({ path: screenshot }); screenshots.push(screenshot);
    await context.close();
  }
} finally {
  await browser.close();
}

equal(externalRequests, [], "zero non-loopback or external requests");
equal(browserErrors, [], "zero page errors");
equal(consoleErrors, [], "zero console errors");
check(performanceReceipts[0]?.elapsedMs < 3_000, "no-draft startup resolves within three seconds");
check(performanceReceipts[0]?.usedJsHeapBytes === null || performanceReceipts[0].usedJsHeapBytes <= 335_544_320, "settled startup heap stays below 320 MiB");

const result = {
  kind: "spec0010-phase3-browser-proof",
  version: 1,
  status: "PASS",
  assertions,
  scenarios: [
    "no-draft-startup",
    "valid-matching-source-recover-save-and-protected-regressions",
    "missing-source-detached-save",
    "confirmed-discard-official-isolation",
    "corrupt-draft-disabled-recover-and-discard",
    "quota-failure-last-good-reload",
    "simultaneous-tab-claim-race",
    "discard-failure-continue-home-without-deleting",
    "compact-reduced-motion-keyboard",
  ],
  performanceReceipts,
  screenshots,
  network: { externalRequests, providerRequests: 0, aiCalls: 0, paidCalls: 0, creditChanges: 0 },
  errors: { page: browserErrors, console: consoleErrors },
};
writeFileSync(`${outputRoot}/browser.json`, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
