import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright-core";

type CanvasState = { digest: string; painted: number; width: number; height: number };

const url = process.argv.find(argument => argument.startsWith("--url="))?.slice(6) ?? "http://127.0.0.1:56960/";
assert.match(url, /^http:\/\/127\.0\.0\.1:[0-9]+\/$/);
const allowedOrigin = new URL(url).origin;
const output = "output/spec-0007/phase-5/browser";
mkdirSync(output, { recursive: true });
let assertions = 0;
const check = (value: unknown, label: string) => { assertions += 1; assert.ok(value, label); };
const equal = (actual: unknown, expected: unknown, label: string) => { assertions += 1; assert.deepEqual(actual, expected, label); };
const settle = (page: Page) => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
const canvas = (page: Page) => page.locator('canvas[data-workspace-canvas="editable"]');
const canvasState = (page: Page): Promise<CanvasState> => canvas(page).evaluate(async element => {
  const target = element as HTMLCanvasElement;
  const context = target.getContext("2d")!;
  const bytes = context.getImageData(0, 0, target.width, target.height).data;
  let painted = 0;
  for (let offset = 3; offset < bytes.length; offset += 4) if (bytes[offset]) painted += 1;
  const hash = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  const digest = Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, "0")).join("");
  return { digest, painted, width: target.width, height: target.height };
});
const authoringBox = (page: Page) => canvas(page).evaluate(element => {
  const bounds = element.parentElement!.parentElement!.getBoundingClientRect();
  return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
});
const drawLine = async (page: Page, startX: number, startY: number, dx = 18, dy = 8) => {
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + dx, startY + dy, { steps: 3 });
  await page.mouse.up();
  await settle(page);
};
const openSavedProject = async (page: Page, title: string) => {
  await page.goto(url);
  await page.getByRole("button", { name: /^Open Project/ }).click();
  await page.getByRole("button", { name: `Open ${title}`, exact: true }).click();
  await canvas(page).waitFor();
  await settle(page);
};

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: false,
  args: ["--disable-background-networking", "--disable-component-update", "--disable-sync", "--disable-extensions", "--no-first-run", "--js-flags=--expose-gc"],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
await context.addInitScript(() => {
  localStorage.setItem("da_welcome_seen", "1");
  const phase = globalThis as typeof globalThis & {
    __phase5LongTasks?: Array<{ startTime: number; duration: number }>;
    __phase5LongTaskObserver?: PerformanceObserver;
  };
  phase.__phase5LongTasks = [];
  phase.__phase5LongTaskObserver = new PerformanceObserver(list => {
    for (const entry of list.getEntries()) phase.__phase5LongTasks!.push({ startTime: entry.startTime, duration: entry.duration });
  });
  phase.__phase5LongTaskObserver.observe({ type: "longtask", buffered: true });
});
const page = await context.newPage();
page.setDefaultTimeout(15_000);
const errors: string[] = [];
const externalRequests: string[] = [];
page.on("pageerror", error => errors.push(`page:${error.message}`));
page.on("console", message => { if (message.type() === "error") errors.push(`console:${message.text()}`); });
await page.route("**/*", async route => {
  const requestUrl = new URL(route.request().url());
  if (requestUrl.origin === allowedOrigin || requestUrl.protocol === "data:" || requestUrl.protocol === "blob:") {
    await route.continue();
  } else {
    externalRequests.push(route.request().url());
    await route.abort();
  }
});

await page.goto(url);
await page.evaluate(() => new Promise<void>((resolve, reject) => {
  const request = indexedDB.deleteDatabase("diamond-animation-unified-v2");
  request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error("indexeddb_delete_blocked"));
}));
await page.goto(url);
await page.getByRole("button", { name: /^New Project/ }).click();
await canvas(page).waitFor();
await page.getByRole("button", { name: "Brush", exact: true }).click();
let box = await authoringBox(page);
await drawLine(page, box.x + 95, box.y + 95, 44, 18);
const beforeInjectedFailure = await canvasState(page);
check(beforeInjectedFailure.painted > 0, "seed content is visibly authored before the injected failure");

await page.getByRole("button", { name: "Shape", exact: true }).click();
box = await authoringBox(page);
await page.mouse.move(box.x + 205, box.y + 165);
await page.mouse.down();
await page.mouse.move(box.x + 330, box.y + 260, { steps: 4 });
await page.evaluate(() => {
  const phase = globalThis as typeof globalThis & {
    __phase5FailHistoryOnce?: boolean;
    __phase5OriginalMapSet?: typeof Map.prototype.set;
    __phase5InjectedFailures?: number;
  };
  phase.__phase5FailHistoryOnce = true;
  phase.__phase5InjectedFailures = 0;
  const original = Map.prototype.set;
  phase.__phase5OriginalMapSet = original;
  Map.prototype.set = function(this: Map<unknown, unknown>, key: unknown, value: unknown) {
    const candidate = value as { entries?: unknown[]; position?: number; blocksGlobalTraversal?: boolean } | null;
    if (phase.__phase5FailHistoryOnce && candidate && Array.isArray(candidate.entries) && candidate.entries.length >= 2 && typeof candidate.position === "number" && candidate.position >= 1 && typeof candidate.blocksGlobalTraversal === "boolean") {
      phase.__phase5FailHistoryOnce = false;
      phase.__phase5InjectedFailures = (phase.__phase5InjectedFailures ?? 0) + 1;
      throw new Error("phase5_injected_history_publication_failure");
    }
    return Reflect.apply(original, this, [key, value]);
  } as typeof Map.prototype.set;
});
await page.mouse.up();
await settle(page);
const injectedFailures = await page.evaluate(() => {
  const phase = globalThis as typeof globalThis & { __phase5OriginalMapSet?: typeof Map.prototype.set; __phase5InjectedFailures?: number };
  if (phase.__phase5OriginalMapSet) Map.prototype.set = phase.__phase5OriginalMapSet;
  return phase.__phase5InjectedFailures ?? 0;
});
equal(injectedFailures, 1, "one deterministic history-publication failure was injected inside the real commit coordinator");
equal(await canvasState(page), beforeInjectedFailure, "failed full-canvas shape commit restores the exact last-good visible bitmap");
await page.waitForTimeout(100);
equal(await canvasState(page), beforeInjectedFailure, "queued pointer-up/autosave work cannot republish the failed transient pixels");

await page.getByRole("button", { name: "Shape", exact: true }).click();
await drawLine(page, box.x + 205, box.y + 165, 125, 95);
const afterSuccessfulRetry = await canvasState(page);
check(afterSuccessfulRetry.digest !== beforeInjectedFailure.digest && afterSuccessfulRetry.painted > beforeInjectedFailure.painted, "the same shape succeeds normally after the one-shot failure");
await page.getByRole("button", { name: "Undo", exact: true }).click(); await settle(page);
equal(await canvasState(page), beforeInjectedFailure, "one Undo removes only the successful retry");
await page.getByRole("button", { name: "Redo", exact: true }).click(); await settle(page);
equal(await canvasState(page), afterSuccessfulRetry, "one Redo restores the exact successful retry");

await page.getByRole("button", { name: "Brush", exact: true }).click();
const monotonicSamples: Array<{ operation: number; painted: number; digest: string }> = [];
let previousPainted = afterSuccessfulRetry.painted;
for (let index = 0; index < 160; index += 1) {
  box = await authoringBox(page);
  const column = index % 20;
  const row = Math.floor(index / 20);
  const x = box.x + 70 + column * Math.min(38, (box.width - 160) / 20);
  const y = box.y + 75 + row * Math.min(48, (box.height - 170) / 8);
  await drawLine(page, x, y, 14, 6);
  if ((index + 1) % 10 === 0) {
    const sample = await canvasState(page);
    check(sample.painted >= previousPainted, `non-delete authored operation ${index + 1} retains every earlier painted pixel`);
    previousPainted = sample.painted;
    monotonicSamples.push({ operation: index + 1, painted: sample.painted, digest: sample.digest });
  }
}
const historyTip = await canvasState(page);
const undoButton = page.getByRole("button", { name: "Undo", exact: true });
const redoButton = page.getByRole("button", { name: "Redo", exact: true });
let undoCount = 0;
while (undoCount < 200 && await undoButton.isEnabled()) { await undoButton.click(); undoCount += 1; }
check(undoCount >= 160, "full available history traverses at least the 160-operation cap");
const historyRoot = await canvasState(page);
equal(historyRoot.painted, 0, "full available Undo reaches the exact blank history root without a partial canvas");
let redoCount = 0;
while (redoCount < 200 && await redoButton.isEnabled()) { await redoButton.click(); redoCount += 1; }
equal(redoCount, undoCount, "full available Redo traverses the same retained history depth");
equal(await canvasState(page), historyTip, "full Redo restores the exact authored and raster digest");

await undoButton.click(); await settle(page);
const afterSingleUndo = await canvasState(page);
check(await redoButton.isEnabled(), "Redo becomes available after an ordinary Undo");
box = await authoringBox(page);
await drawLine(page, box.x + box.width - 125, box.y + box.height - 115, 20, -14);
check(!(await redoButton.isEnabled()), "a new edit after Undo clears the Redo branch");
check((await canvasState(page)).digest !== afterSingleUndo.digest, "the replacement edit commits visibly");

await page.getByRole("button", { name: "File", exact: true }).click();
await page.getByRole("menuitem", { name: "Save", exact: true }).click();
await page.waitForFunction(() => {
  const text = document.querySelector('[role="status"]')?.textContent?.trim() ?? "";
  return text === "Saved on this browser" || text === "Save failed" || text === "Too large to save";
});
equal((await page.getByRole("status").textContent())?.trim(), "Saved on this browser", "Save reaches the successful terminal state");
const saved = await canvasState(page);
await openSavedProject(page, "Untitled Project");
equal(await canvasState(page), saved, "Save/reload/Open preserves the exact last-good canvas");

page.once("dialog", dialog => dialog.accept("Phase 5 Copy"));
await page.getByRole("button", { name: "File", exact: true }).click();
await page.getByRole("menuitem", { name: "Save As", exact: true }).click();
await page.waitForFunction(() => document.body.textContent?.includes("Phase 5 Copy"));
await openSavedProject(page, "Untitled Project");
equal(await canvasState(page), saved, "Save As leaves the original project exact");
await openSavedProject(page, "Phase 5 Copy");
equal(await canvasState(page), saved, "Save As creates an independently openable exact copy");

await page.goto(url);
await page.getByRole("button", { name: /^New Project/ }).click();
await canvas(page).waitFor();
await page.getByRole("button", { name: "Brush", exact: true }).click();
box = await authoringBox(page);
await drawLine(page, box.x + 95, box.y + 95, 44, 18);

const cells = page.locator("button[data-timeline-cell]");
await cells.first().click({ button: "right" });
await page.getByRole("button", { name: "Insert Blank Keyframe", exact: true }).click();
await settle(page);
await page.getByRole("button", { name: "Brush", exact: true }).click();
box = await authoringBox(page);
await drawLine(page, box.x + box.width / 2, box.y + box.height / 2, 45, 22);
await page.locator('button[data-timeline-cell][data-frame-index="0"]').last().click();
await settle(page);
await page.getByRole("spinbutton", { name: "FPS", exact: true }).fill("8");
await page.keyboard.press("Enter");
const beforePlayback = await canvasState(page);
await page.getByRole("button", { name: "Onion", exact: true }).click();
await page.getByRole("button", { name: "Play", exact: true }).click();
await page.waitForTimeout(360);
await page.getByRole("button", { name: "Pause", exact: true }).click();
await settle(page);
equal(await canvasState(page), beforePlayback, "playback warmup performs no document write");
const playbackLongTasks: number[] = [];
for (let loop = 0; loop < 5; loop += 1) {
  await page.evaluate(() => (globalThis as typeof globalThis & { gc?: () => void }).gc?.());
  await page.waitForTimeout(50);
  const playbackStartedAt = await page.evaluate(() => {
    const phase = globalThis as typeof globalThis & {
      __phase5LongTasks?: Array<{ startTime: number; duration: number }>;
      __phase5LongTaskObserver?: PerformanceObserver;
    };
    phase.__phase5LongTaskObserver?.takeRecords();
    phase.__phase5LongTasks = [];
    return performance.now();
  });
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForTimeout(360);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await settle(page);
  playbackLongTasks.push(...await page.evaluate(startedAt => {
    const phase = globalThis as typeof globalThis & {
      __phase5LongTasks?: Array<{ startTime: number; duration: number }>;
      __phase5LongTaskObserver?: PerformanceObserver;
    };
    const pending = phase.__phase5LongTaskObserver?.takeRecords().map(entry => ({ startTime: entry.startTime, duration: entry.duration })) ?? [];
    const endedAt = performance.now();
    return [...(phase.__phase5LongTasks ?? []), ...pending]
      .filter(entry => entry.startTime >= startedAt && entry.startTime <= endedAt)
      .map(entry => entry.duration);
  }, playbackStartedAt));
  equal(await canvasState(page), beforePlayback, `warmed playback loop ${loop + 1} performs no document write`);
}

await page.locator('button[data-timeline-cell][data-frame-index="1"]').last().click({ button: "right" });
await page.getByRole("button", { name: "Remove Frame", exact: true }).click();
await settle(page);
await page.locator('button[data-timeline-cell][data-frame-index="0"]').last().click();
await settle(page);
equal(await canvasState(page), beforePlayback, "removing the playback-only frame preserves the retained frame exactly");
const compactReference = await canvasState(page);

await page.setViewportSize({ width: 390, height: 844 });
await settle(page);
check(await page.getByRole("button", { name: "Brush", exact: true }).isVisible(), "compact editor keeps the ordinary tool surface visible");
const compactBeforeKeyboard = await canvasState(page);
equal(compactBeforeKeyboard.painted, compactReference.painted, "compact reflow retains every authored pixel");
await page.getByRole("button", { name: "Brush", exact: true }).focus();
await page.keyboard.press("Enter");
equal(await canvasState(page), compactBeforeKeyboard, "keyboard tool activation in compact view is non-destructive");
const overflow = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
check(overflow.width <= overflow.client + 1, "compact workspace has no page-level horizontal overflow");

await page.addScriptTag({ content: readFileSync("node_modules/axe-core/axe.min.js", "utf8") });
const seriousAxe = await page.evaluate(async () => {
  const result = await (globalThis as typeof globalThis & { axe: { run: (options: unknown) => Promise<{ violations: Array<{ id: string; impact: string | null; nodes: unknown[] }> }> } }).axe.run({
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
  });
  return result.violations.filter(violation => violation.impact === "critical" || violation.impact === "serious").map(violation => ({ id: violation.id, impact: violation.impact, nodes: violation.nodes.length }));
});
equal(seriousAxe, [], "compact/reduced-motion editor has zero critical or serious Axe violation");
await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
await settle(page);
check(await page.getByRole("button", { name: "Brush", exact: true }).isVisible(), "ordinary tool remains reachable at 200% CSS zoom");
await page.evaluate(() => { document.documentElement.style.zoom = ""; });
await page.screenshot({ path: `${output}/phase5-final-compact.png`, fullPage: true });

const maxLongTaskMs = playbackLongTasks.length ? Math.max(...playbackLongTasks) : 0;
console.log(JSON.stringify({ phase5PlaybackLongTasks: playbackLongTasks, maxLongTaskMs }));
check(maxLongTaskMs <= 200, "no observed long task exceeds 200 ms");
await page.evaluate(() => (globalThis as typeof globalThis & { gc?: () => void }).gc?.());
const settledHeapBytes = await page.evaluate(() => (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0);
console.log(JSON.stringify({ phase5SettledHeapBytes: settledHeapBytes }));
check(settledHeapBytes === 0 || settledHeapBytes < 320 * 1024 * 1024, "settled browser heap remains below 320 MiB");
equal(externalRequests, [], "complete Phase 5 browser flow performs zero external request");
equal(errors, [], "complete Phase 5 browser flow emits no page or console error");

const result = {
  status: "PASS",
  assertions,
  injectedFailures,
  beforeInjectedFailure,
  afterSuccessfulRetry,
  monotonicSamples,
  history: { authoredOperations: 160, undoCount, redoCount, root: historyRoot, tip: historyTip },
  persistence: { original: saved, copy: saved },
  playbackLoops: 5,
  accessibility: { seriousAxe, compactOverflow: overflow },
  performance: { playbackLongTasks, maxLongTaskMs, settledHeapBytes },
  externalRequests,
  errors,
};
writeFileSync(`${output}/phase5-browser.json`, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ status: result.status, assertions, injectedFailures, undoCount, redoCount, maxLongTaskMs, settledHeapBytes }));
await context.close();
await browser.close();
