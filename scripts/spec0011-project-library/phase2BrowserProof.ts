import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright-core";
import { createPhase1LegacyFixtureTransport } from "./phase1Fixtures.ts";

const url = process.argv.find(argument => argument.startsWith("--url="))?.slice(6) ?? "http://127.0.0.1:57730/";
assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
const origin = new URL(url).origin;
const outputRoot = resolve("output/spec-0011/phase-2/browser");
mkdirSync(outputRoot, { recursive: true });
const fixtures = await createPhase1LegacyFixtureTransport();
const axePath = resolve("node_modules/axe-core/axe.min.js");

let assertions = 0;
const operations: string[] = [];
const screenshots: string[] = [];
const pageErrors: string[] = [];
const consoleErrors: string[] = [];
const requests: Array<{ method: string; url: string; disposition: string }> = [];
let desktopAudioStats: unknown = null;
let performanceEvidence: unknown = null;
let sourceInvalidationEvidence: unknown = null;
let storageEvidence: unknown = null;
let productionAiRouteEvidence: unknown = null;
let terraHiEvidence: unknown = null;
const terraResponseReceipts: Array<{ method: string; status: number; contentType: string; mode: string }> = [];
const check = (value: unknown, label: string) => { assertions += 1; assert.ok(value, label); };
const equal = (actual: unknown, expected: unknown, label: string) => { assertions += 1; assert.deepEqual(actual, expected, label); };
const close = (actual: number, expected: number, tolerance: number, label: string) => {
  assertions += 1;
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);
};
const step = async (label: string, run: () => Promise<void>) => { await run(); operations.push(label); console.log(`PASS ${label}`); };
const screenshot = async (page: Page, name: string) => {
  const file = `${name}.png`;
  await page.screenshot({ path: resolve(outputRoot, file), fullPage: true });
  screenshots.push(file);
};

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: !process.argv.includes("--headed"),
  args: ["--disable-background-networking", "--disable-component-update", "--disable-sync", "--disable-extensions", "--enable-precise-memory-info", "--js-flags=--expose-gc", "--no-first-run"],
});

const configure = async (context: BrowserContext, terraMode: "natural" | "html-failure" | null = null) => {
  const terraJobs = new Map<string, unknown>();
  await context.route("**/*", async route => {
    const request = route.request();
    const parsed = new URL(request.url());
    const sameOrigin = parsed.origin === origin;
    const aiAvailability = sameOrigin && parsed.pathname === "/api/ai" && request.method() === "GET";
    const aiAnimator = sameOrigin && parsed.pathname === "/api/ai-animator" && terraMode !== null;
    const allowed = sameOrigin && !parsed.pathname.startsWith("/api/");
    const disposition = aiAnimator
      ? terraMode === "natural" ? "fulfilled-terra-double" : "fulfilled-non-json-double"
      : aiAvailability ? "fulfilled-disabled-ai" : allowed ? "loopback" : "blocked";
    requests.push({ method: request.method(), url: `${parsed.origin}${parsed.pathname}`, disposition });
    if (aiAnimator && terraMode === "html-failure") {
      terraResponseReceipts.push({ method: request.method(), status: 404, contentType: "text/html; charset=utf-8", mode: terraMode });
      await route.fulfill({ status: 404, contentType: "text/html; charset=utf-8", body: "<!DOCTYPE html><title>Not Found</title>" });
    } else if (aiAnimator && request.method() === "POST") {
      const body = request.postDataJSON() as {
        jobId: string;
        turnId: string;
        message: string;
        reasoningLevel: "low" | "medium" | "high" | "extra-high";
        workspace: { projectId: string; projectGeneration: number };
      };
      equal(body.message, "hi", "Terra deterministic request carries the exact user message hi");
      const now = new Date().toISOString();
      const effort = body.reasoningLevel === "extra-high" ? "xhigh" : body.reasoningLevel;
      const usage = { inputTokens: 12, outputTokens: 10, totalTokens: 22, estimatedCostUsd: 0 };
      const thinking = {
        version: 1, jobId: body.jobId, turnId: body.turnId, projectId: body.workspace.projectId,
        projectGeneration: body.workspace.projectGeneration, reasoningLevel: body.reasoningLevel, intent: null,
        status: "thinking", lastSequence: 1, createdAt: now, updatedAt: now, completedAt: null,
        telemetry: { model: "gpt-5.6-terra", effort, outcome: "active", latencyMs: null, promptDigest: "0".repeat(64), usage: { inputTokens: null, outputTokens: null, totalTokens: null, estimatedCostUsd: null } },
        events: [{ sequence: 1, status: "thinking", createdAt: now }],
      };
      const doneAt = new Date(Date.now() + 10).toISOString();
      const done = {
        ...thinking, intent: "conversation", status: "done", lastSequence: 2, updatedAt: doneAt, completedAt: doneAt,
        telemetry: { model: "gpt-5.6-terra", effort, outcome: "succeeded", latencyMs: 10, promptDigest: "1".repeat(64), usage },
        events: [...thinking.events, {
          sequence: 2, status: "done", createdAt: doneAt,
          reply: { intent: "conversation", reply: "Hi! I’m Terra. What would you like help with?", focusedQuestion: null, planSummary: null },
        }],
      };
      terraJobs.set(body.jobId, done);
      terraResponseReceipts.push({ method: "POST", status: 202, contentType: "application/json", mode: terraMode });
      await route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify(thinking) });
    } else if (aiAnimator && request.method() === "GET") {
      const job = terraJobs.get(parsed.searchParams.get("jobId") ?? "");
      const status = job ? 200 : 404;
      terraResponseReceipts.push({ method: "GET", status, contentType: "application/json", mode: terraMode });
      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(job ?? { error: "missing deterministic job" }) });
    } else if (aiAnimator) {
      terraResponseReceipts.push({ method: request.method(), status: 405, contentType: "application/json", mode: terraMode });
      await route.fulfill({ status: 405, contentType: "application/json", body: '{"error":"unsupported deterministic method"}' });
    } else if (aiAvailability) await route.fulfill({ status: 200, contentType: "application/json", body: '{"available":false,"reason":"spec0011-phase2-proof"}' });
    else if (allowed) await route.continue();
    else await route.abort();
  });
  await context.addInitScript(() => {
    localStorage.setItem("da_welcome_seen", "1");
    localStorage.setItem("da_welcome_never_show", "1");
    const state = {
      offset: 0,
      rate: 0.02,
      blockResume: false,
      failDecode: false,
      decodeCalls: 0,
      decodeInFlight: 0,
      maximumDecodeConcurrency: 0,
      contexts: 0,
      closes: 0,
      resumeAttempts: 0,
      starts: [] as Array<{ when: number; offset: number; duration: number }>,
      stops: 0,
      disconnects: 0,
    };
    class FakeSource {
      buffer: { duration: number } | null = null;
      onended: (() => void) | null = null;
      connect() { return this; }
      disconnect() { state.disconnects += 1; }
      start(when: number, offset: number, duration: number) { state.starts.push({ when, offset, duration }); }
      stop() { state.stops += 1; }
    }
    class FakeAudioContext {
      state: AudioContextState = "suspended";
      destination = {};
      private startedAt = performance.now();
      constructor() { state.contexts += 1; }
      get currentTime() { return state.offset + (this.state === "running" ? (performance.now() - this.startedAt) / 1000 * state.rate : 0); }
      async decodeAudioData() {
        state.decodeCalls += 1;
        state.decodeInFlight += 1;
        state.maximumDecodeConcurrency = Math.max(state.maximumDecodeConcurrency, state.decodeInFlight);
        await new Promise(resolveDelay => setTimeout(resolveDelay, 5));
        state.decodeInFlight -= 1;
        if (state.failDecode) throw new Error("deterministic decode failure");
        return { duration: 1 };
      }
      createBufferSource() { return new FakeSource(); }
      async resume() {
        state.resumeAttempts += 1;
        if (!state.blockResume) { this.state = "running"; this.startedAt = performance.now(); }
      }
      async close() { this.state = "closed"; state.closes += 1; }
    }
    (window as unknown as { AudioContext: typeof AudioContext }).AudioContext = FakeAudioContext as unknown as typeof AudioContext;
    (window as unknown as { __phase2Audio: unknown }).__phase2Audio = {
      state,
      advance: (seconds: number) => { state.offset += seconds; },
      setBlocked: (value: boolean) => { state.blockResume = value; },
      setDecodeFailure: (value: boolean) => { state.failDecode = value; },
    };
    const longTasks: number[] = [];
    try {
      new PerformanceObserver(entries => {
        for (const entry of entries.getEntries()) longTasks.push(entry.duration);
      }).observe({ type: "longtask", buffered: true });
    } catch { /* long-task observation is optional browser evidence */ }
    (window as unknown as { __phase2Performance: unknown }).__phase2Performance = { longTasks };
  });
};

const attachErrors = (page: Page) => {
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(`${message.text()} @ ${message.location().url}`); });
};

const seedLegacy = (page: Page) => page.evaluate(async ({ values, unified }) => {
  const drawings = values.filter(value => value.sourceKind === "drawing-v1").map(value => "project" in value ? value.project : null);
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
      ] as const) if (!open.result.objectStoreNames.contains(name)) open.result.createObjectStore(name, { keyPath: typeof keyPath === "string" ? keyPath : [...keyPath] });
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

const storageDigest = async (page: Page) => page.evaluate(async () => {
  const hash = async (value: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map(byte => byte.toString(16).padStart(2, "0")).join("");
  const local: Record<string, string> = {};
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)!;
    if (!key.startsWith("da_welcome")) local[key] = await hash(localStorage.getItem(key) ?? "");
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
      const scrub = JSON.stringify(rows, (_key, value) => value instanceof Blob ? { size: value.size, type: value.type } : ArrayBuffer.isView(value) ? { byteLength: value.byteLength } : value);
      stores[storeName] = { count: rows.length, digest: await hash(scrub) };
    }
    database.close();
    indexed[info.name!] = stores;
  }
  return { local, indexed };
});

const openLibrary = async (page: Page) => {
  await page.goto(url, { waitUntil: "networkidle" });
  await seedLegacy(page);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^My Projects/ }).click();
  await page.getByRole("heading", { name: "My Projects" }).waitFor();
  const card = page.getByRole("button", { name: "Watch Drawing study (V2)", exact: true });
  await card.waitFor({ timeout: 30_000 });
  return card;
};

const openViewer = async (page: Page, card: ReturnType<Page["getByRole"]>) => {
  await card.click();
  const dialog = page.getByRole("dialog", { name: "Drawing study (V2)" });
  await dialog.waitFor();
  return dialog;
};

const assertViewerSurfaceUnobstructed = async (page: Page, label: string) => {
  const evidence = await page.locator('[data-canonical-project-player="viewer"]').evaluate(root => {
    const surface = root.querySelector<HTMLElement>('[data-project-player-video-surface="true"]')!;
    const canvas = root.querySelector<HTMLCanvasElement>("canvas")!;
    const chrome = root.querySelector<HTMLElement>('[data-player-controls-visible]')!;
    const surfaceRect = surface.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const chromeRect = chrome.getBoundingClientRect();
    const context = canvas.getContext("2d")!;
    const y = Math.max(0, canvas.height - 2);
    const left = Array.from(context.getImageData(Math.max(0, Math.floor(canvas.width * 0.25)), y, 1, 1).data);
    const right = Array.from(context.getImageData(Math.max(0, Math.floor(canvas.width * 0.75)), y, 1, 1).data);
    const style = getComputedStyle(chrome);
    return {
      surface: { top: surfaceRect.top, bottom: surfaceRect.bottom, height: surfaceRect.height },
      canvas: { top: canvasRect.top, bottom: canvasRect.bottom, height: canvasRect.height },
      chrome: { top: chromeRect.top, bottom: chromeRect.bottom, height: chromeRect.height },
      chromePosition: style.position,
      chromeBackgroundImage: style.backgroundImage,
      bottomPixels: { left, right },
    };
  });
  check(evidence.surface.height > 0 && evidence.canvas.height > 0 && evidence.chrome.height > 0, `${label} has measurable video, canvas, and control regions`);
  check(evidence.chrome.top >= evidence.surface.bottom - 0.5, `${label} controls begin below the visible animation surface`);
  check(evidence.canvas.bottom <= evidence.surface.bottom + 0.5, `${label} canvas remains fully contained above the controls`);
  equal(evidence.chromePosition, "relative", `${label} controls participate in layout instead of overlaying the canvas`);
  equal(evidence.chromeBackgroundImage, "none", `${label} has no dark control gradient over the animation`);
  const [leftRed, leftGreen, leftBlue, leftAlpha] = evidence.bottomPixels.left;
  const [rightRed, rightGreen, rightBlue, rightAlpha] = evidence.bottomPixels.right;
  check(leftAlpha > 0 && leftBlue > leftRed && leftBlue > leftGreen, `${label} preserves the fixture's blue authored paint at the bottom edge`);
  check(rightAlpha > 0 && rightRed > rightBlue && rightGreen > rightBlue, `${label} preserves the fixture's yellow authored paint at the bottom edge`);
  return evidence;
};

const audioControl = (page: Page, expression: "stats" | "advance" | "block" | "decode", value?: number | boolean) => page.evaluate(({ expression: action, value: next }) => {
  const control = (window as unknown as { __phase2Audio: { state: unknown; advance: (seconds: number) => void; setBlocked: (value: boolean) => void; setDecodeFailure: (value: boolean) => void } }).__phase2Audio;
  if (action === "advance") control.advance(Number(next));
  if (action === "block") control.setBlocked(Boolean(next));
  if (action === "decode") control.setDecodeFailure(Boolean(next));
  return control.state;
}, { expression, value });

const assertNoOverflow = async (page: Page, label: string) => {
  const values = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  check(values.scrollWidth <= values.clientWidth, `${label} has no horizontal overflow`);
};
const percentile95 = (values: number[]) => [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * 0.95) - 1)];
const readHeap = (page: Page) => page.evaluate(() => {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
  return memory ? { used: memory.usedJSHeapSize, total: memory.totalJSHeapSize, limit: memory.jsHeapSizeLimit } : null;
});

try {
  await step("terra:production-route-json-reachability", async () => {
    const response = await fetch(`${url}api/ai-animator?jobId=spec0011-missing&projectId=spec0011-proof`, { cache: "no-store" });
    const contentType = response.headers.get("content-type") ?? "";
    const bodyText = await response.text();
    let body: unknown = null;
    try { body = JSON.parse(bodyText); } catch { /* asserted below */ }
    equal(response.status, 404, "production AI Animator route returns the expected missing-job status without invoking a provider");
    check(contentType.toLowerCase().includes("application/json"), "production AI Animator route advertises JSON");
    check(typeof body === "object" && body !== null && "error" in body, "production AI Animator route returns a structured JSON error");
    check(!bodyText.includes("<!DOCTYPE"), "production AI Animator route never falls through to a Next HTML page");
    productionAiRouteEvidence = { method: "GET", status: response.status, contentType, structuredError: true, providerInvoked: false };
  });

  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
  await configure(desktop);
  const page = await desktop.newPage();
  attachErrors(page);
  const card = await openLibrary(page);
  const before = await storageDigest(page);

  await step("desktop:modal-geometry-focus-and-contain", async () => {
    const dialog = await openViewer(page, card);
    equal(await page.locator('[data-project-library="my-projects"]').getAttribute("aria-hidden"), "true", "background library is aria-hidden while viewer is open");
    equal(await page.locator('[data-project-library="my-projects"]').evaluate(element => (element as HTMLElement).inert), true, "background library is inert while viewer is open");
    equal(await dialog.locator('[tabindex="0"]').first().evaluate(element => element === document.activeElement), true, "title context receives initial focus");
    const box = await dialog.boundingBox();
    assert.ok(box);
    check(box.width <= 1120.5 && box.height <= 760.5, "desktop dialog respects 1120x760 maximum");
    check(box.x >= 23 && box.y >= 23, "desktop dialog keeps the 24px viewport inset");
    const geometry = await dialog.locator("canvas").evaluate(canvas => {
      const element = canvas as HTMLCanvasElement;
      const rect = element.getBoundingClientRect();
      return { backingWidth: element.width, backingHeight: element.height, cssWidth: rect.width, cssHeight: rect.height, dpr: window.devicePixelRatio };
    });
    close(geometry.cssWidth / geometry.cssHeight, 16 / 9, 0.002, "canvas CSS retains the exact saved aspect");
    check(geometry.backingWidth <= 4096 && geometry.backingHeight <= 4096, "canvas backing store respects the 4096 cap");
    check(geometry.backingWidth / geometry.cssWidth <= 2.01, "canvas backing store DPR is capped at two");
    await assertViewerSurfaceUnobstructed(page, "desktop viewer");
    await page.addScriptTag({ path: axePath });
    const violations = await page.evaluate(async () => {
      const result = await (window as unknown as { axe: { run: (node: Element) => Promise<{ violations: Array<{ impact: string | null; id: string }> }> } }).axe.run(document.querySelector('[data-project-movie-viewer="true"]')!);
      return result.violations.filter(violation => violation.impact === "critical" || violation.impact === "serious");
    });
    equal(violations, [], "viewer has zero serious or critical Axe violations");
    await screenshot(page, "desktop-unobstructed");
  });

  await step("desktop:focus-order-keyboard-seek-and-clock", async () => {
    const dialog = page.getByRole("dialog", { name: "Drawing study (V2)" });
    const titleContext = dialog.locator('[tabindex="0"]').first();
    await titleContext.focus();
    await page.keyboard.press("Tab");
    equal(await dialog.getByRole("button", { name: "Close" }).evaluate(element => element === document.activeElement), true, "focus order moves from title context to Close");
    await page.keyboard.press("Tab");
    equal(await dialog.getByRole("button", { name: "Play animation" }).evaluate(element => element === document.activeElement), true, "focus order moves to Play");
    await page.keyboard.press("Tab");
    equal(await dialog.getByRole("slider", { name: "Animation position" }).evaluate(element => element === document.activeElement), true, "focus order moves to Seek");
    await page.keyboard.press("Tab");
    equal(await dialog.getByRole("button", { name: "Enter fullscreen" }).evaluate(element => element === document.activeElement), true, "focus order moves to Fullscreen");
    await titleContext.focus();
    await page.keyboard.press("k");
    await dialog.getByRole("button", { name: "Pause animation" }).waitFor();
    const initialAudio = await audioControl(page, "stats") as { decodeCalls: number; starts: unknown[]; maximumDecodeConcurrency: number };
    equal(initialAudio.decodeCalls, 1, "viewer decodes the unique saved audio asset once");
    equal(initialAudio.maximumDecodeConcurrency, 1, "single unique asset stays within the two-decode bound");
    check(initialAudio.starts.length >= 1, "Play schedules authored audio");
    await page.keyboard.press("Shift+ArrowRight");
    const slider = dialog.getByRole("slider", { name: "Animation position" });
    check(Number(await slider.inputValue()) >= 1, "Shift+ArrowRight seeks exactly one saved frame");
    check((await slider.getAttribute("aria-valuetext"))?.includes("frame 2 of 2"), "seek exposes truthful time and frame text");
    await page.keyboard.press("Home");
    equal(Number(await slider.inputValue()), 0, "Home seeks to zero");
    await page.keyboard.press("End");
    equal(Number(await slider.inputValue()), 2, "End seeks to exact duration");
    await page.keyboard.press("k");
    await dialog.getByRole("button", { name: "Pause animation" }).waitFor();
    check(Number(await slider.inputValue()) < 2, "Play after completion restarts from zero");
    await dialog.locator('[data-project-player-video-surface="true"]').click();
    await dialog.getByRole("button", { name: "Play animation" }).waitFor();
    equal((await audioControl(page, "stats") as { stops: number }).stops > 0, true, "surface pause stops scheduled audio");
  });

  await step("desktop:completion-replay-controls-and-audio-seek", async () => {
    const dialog = page.getByRole("dialog", { name: "Drawing study (V2)" });
    const play = dialog.getByRole("button", { name: "Play animation" });
    await play.click();
    await dialog.getByRole("button", { name: "Pause animation" }).waitFor();
    const slider = dialog.getByRole("slider", { name: "Animation position" });
    await slider.fill("1");
    const startsAfterSeek = (await audioControl(page, "stats") as { starts: Array<{ offset: number }> }).starts;
    check(startsAfterSeek.some(start => start.offset > 0), "playing seek reschedules intersecting audio at a source offset");
    await page.waitForTimeout(30);
    await audioControl(page, "advance", 1);
    await dialog.getByRole("button", { name: "Replay animation" }).waitFor();
    equal(Number(await slider.inputValue()), 2, "completion stops at exact duration on the final frame");
    const replay = dialog.getByRole("button", { name: "Replay animation" });
    equal(await replay.textContent(), "Replay", "completed playback exposes the explicit Replay label");
    await replay.click();
    await dialog.getByRole("button", { name: "Pause animation" }).waitFor();
    check(Number(await slider.inputValue()) < 2, "replay starts from zero after completion");
    await page.waitForFunction(() => document.querySelector<HTMLCanvasElement>('[data-canonical-project-player="viewer"] canvas')?.dataset.projectPlayerRenderedFrame === "0");
    check((await slider.getAttribute("aria-valuetext"))?.includes("frame 1 of 2"), "Replay visibly returns to frame 1");
    await dialog.locator('[tabindex="0"]').first().focus();
    const stage = dialog.locator('[data-project-player-fullscreen]');
    await stage.hover();
    await page.waitForTimeout(2_650);
    equal(await dialog.locator('[data-player-controls-visible]').getAttribute("data-player-controls-visible"), "false", "controls hide after 2.5 seconds of uninterrupted pointer inactivity");
    await stage.hover({ position: { x: 20, y: 20 } });
    equal(await dialog.locator('[data-player-controls-visible]').getAttribute("data-player-controls-visible"), "true", "pointer movement reveals controls");
    await slider.focus();
    await page.waitForTimeout(2_650);
    equal(await dialog.locator('[data-player-controls-visible]').getAttribute("data-player-controls-visible"), "true", "controls never hide while a control owns focus");
    await dialog.getByRole("button", { name: "Pause animation" }).click();
  });

  await step("desktop:fullscreen-entry-exit-and-modal-close", async () => {
    const dialog = page.getByRole("dialog", { name: "Drawing study (V2)" });
    await dialog.getByRole("button", { name: "Enter fullscreen" }).click();
    await page.waitForFunction(() => Boolean(document.fullscreenElement));
    await dialog.getByRole("button", { name: "Exit fullscreen" }).waitFor();
    equal(await dialog.getByRole("button", { name: "Exit fullscreen" }).count(), 1, "fullscreen label follows actual fullscreenchange state");
    await assertViewerSurfaceUnobstructed(page, "fullscreen viewer");
    await screenshot(page, "desktop-fullscreen-unobstructed");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.fullscreenElement);
    equal(await dialog.count(), 1, "first Escape exits fullscreen and leaves the modal open");
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Watch Drawing study (V2)");
    equal(await card.evaluate(element => element === document.activeElement), true, "second Escape closes and restores invoking-card focus");
  });

  await step("desktop:truthful-audio-and-fullscreen-failures", async () => {
    await audioControl(page, "decode", true);
    let dialog = await openViewer(page, card);
    await dialog.getByRole("alert").filter({ hasText: "Audio unavailable" }).waitFor();
    await dialog.getByRole("button", { name: "Play animation" }).click();
    await dialog.getByRole("button", { name: "Pause animation" }).waitFor();
    await dialog.getByRole("button", { name: "Pause animation" }).click();
    await dialog.getByRole("button", { name: "Close" }).click();
    await dialog.waitFor({ state: "detached" });
    await audioControl(page, "decode", false);

    await audioControl(page, "block", true);
    dialog = await openViewer(page, card);
    await dialog.getByRole("button", { name: "Play animation" }).click();
    await dialog.getByRole("status").filter({ hasText: "Click Play to enable audio" }).waitFor();
    equal(await dialog.getByRole("button", { name: "Play animation" }).count(), 1, "blocked audio does not pretend playback started");
    await audioControl(page, "block", false);
    await dialog.getByRole("button", { name: "Play animation" }).click();
    await dialog.getByRole("button", { name: "Pause animation" }).waitFor();
    await dialog.getByRole("button", { name: "Pause animation" }).click();
    await dialog.locator('[data-project-player-fullscreen]').evaluate(element => {
      (element as HTMLElement & { requestFullscreen: () => Promise<void> }).requestFullscreen = () => Promise.reject(new Error("denied"));
    });
    await dialog.getByRole("button", { name: "Enter fullscreen" }).click();
    await dialog.getByRole("status").filter({ hasText: "Fullscreen unavailable" }).waitFor();
    await dialog.getByRole("button", { name: "Close" }).click();
    await dialog.waitFor({ state: "detached" });
  });

  await step("desktop:rapid-races-hidden-clock-and-resource-cycles", async () => {
    const cdp = await desktop.newCDPSession(page);
    await cdp.send("HeapProfiler.collectGarbage");
    const baselineHeap = await readHeap(page);
    const openMilliseconds: number[] = [];
    const playMilliseconds: number[] = [];
    const seekCanvasMilliseconds: number[] = [];
    const transientHeaps: number[] = [];
    for (let cycle = 0; cycle < 5; cycle += 1) {
      let started = performance.now();
      const dialog = await openViewer(page, card);
      await dialog.locator("canvas").waitFor();
      openMilliseconds.push(performance.now() - started);
      const play = dialog.getByRole("button", { name: "Play animation" });
      started = performance.now();
      await play.click();
      await dialog.getByRole("button", { name: "Pause animation" }).waitFor();
      playMilliseconds.push(performance.now() - started);
      await dialog.getByRole("button", { name: "Pause animation" }).click();
      const slider = dialog.getByRole("slider", { name: "Animation position" });
      started = performance.now();
      await slider.fill("1");
      await page.waitForFunction(() => {
        const current = document.querySelector<HTMLCanvasElement>('[data-canonical-project-player="viewer"] canvas');
        return current?.dataset.projectPlayerRenderedFrame === "1";
      });
      seekCanvasMilliseconds.push(performance.now() - started);
      if (cycle === 0) {
        await slider.fill("0");
        await dialog.locator('[tabindex="0"]').first().focus();
        await page.keyboard.press("k");
        await page.keyboard.press("ArrowRight");
        await dialog.getByRole("button", { name: "Play animation" }).waitFor();
        equal(Number(await slider.inputValue()), 2, "rapid play, seek, and pause settle on one exact clamped state");
        await slider.fill("0");
        await play.click();
        await page.evaluate(() => {
          Object.defineProperty(document, "hidden", { configurable: true, value: true });
          document.dispatchEvent(new Event("visibilitychange"));
        });
        await audioControl(page, "advance", 1);
        await page.evaluate(() => {
          Object.defineProperty(document, "hidden", { configurable: true, value: false });
          document.dispatchEvent(new Event("visibilitychange"));
        });
        await dialog.getByRole("button", { name: "Play animation" }).waitFor();
        equal(Number(await slider.inputValue()), 2, "returning from a hidden page reconciles exact duration from the monotonic clock");
      }
      const heap = await readHeap(page);
      if (heap) transientHeaps.push(heap.used);
      await dialog.getByRole("button", { name: "Close" }).click();
      await dialog.waitFor({ state: "detached" });
    }
    await cdp.send("HeapProfiler.collectGarbage");
    const settledHeap = await readHeap(page);
    const longTasks = await page.evaluate(() => (window as unknown as { __phase2Performance: { longTasks: number[] } }).__phase2Performance.longTasks);
    const maxLongTaskMilliseconds = longTasks.length > 0 ? Math.max(...longTasks) : 0;
    const openP95 = percentile95(openMilliseconds);
    const playP95 = percentile95(playMilliseconds);
    const seekP95 = percentile95(seekCanvasMilliseconds);
    check(openP95 <= 1_000, "viewer validated first-frame p95 stays within one second");
    check(playP95 <= 100, "Play acknowledgement p95 stays within 100 ms");
    check(seekP95 <= 250, "released seek canvas update p95 stays within 250 ms");
    check(maxLongTaskMilliseconds <= 250, "no observed main-thread long task exceeds 250 ms");
    if (baselineHeap && settledHeap) {
      check(settledHeap.used - baselineHeap.used <= 32 * 1024 * 1024, "five-cycle settled heap delta stays within 32 MiB");
      check(settledHeap.used <= 320 * 1024 * 1024, "representative settled heap stays within 320 MiB");
      check(Math.max(...transientHeaps, settledHeap.used) <= 512 * 1024 * 1024, "representative transient heap stays within 512 MiB");
    }
    const resourceAudio = await audioControl(page, "stats") as { contexts: number; closes: number };
    equal(resourceAudio.closes, resourceAudio.contexts, "all viewer audio contexts close after five resource cycles");
    performanceEvidence = {
      openMilliseconds,
      playMilliseconds,
      seekCanvasMilliseconds,
      p95: { viewerOpen: openP95, playAcknowledgement: playP95, seekCanvasUpdate: seekP95 },
      longTasks: { count: longTasks.length, maximumMilliseconds: maxLongTaskMilliseconds },
      heap: { available: Boolean(baselineHeap && settledHeap), baseline: baselineHeap, settled: settledHeap, transientMaximum: transientHeaps.length > 0 ? Math.max(...transientHeaps) : null },
      resourceCycles: 5,
    };
    await cdp.detach();
  });

  const after = await storageDigest(page);
  equal(after, before, "watch, play, pause, seek, fullscreen, failure and close preserve official project/recovery bytes");
  storageEvidence = { before, after, unchanged: true };
  await page.getByRole("button", { name: "← Back" }).click();
  await page.getByRole("button", { name: /^Open Project/ }).click();
  await page.getByRole("button", { name: "Open Drawing study (V2)", exact: true }).click();
  const editable = page.locator('canvas[data-workspace-canvas="editable"]');
  await editable.waitFor();
  equal(await page.locator('[data-project-movie-viewer="true"]').count(), 0, "Open Project remains the sole editor route");
  await step("desktop:protected-workspace-save-recovery-and-export-regressions", async () => {
    check(await page.getByRole("button", { name: "Brush", exact: true }).last().isVisible(), "protected Brush control remains available");
    check(await page.getByRole("button", { name: "Onion", exact: true }).isVisible(), "protected Onion control remains available");
    check(await page.locator('[data-timeline-cell="true"]').count() >= 2, "protected timeline remains mounted");
    await page.getByRole("button", { name: "File" }).click();
    await page.getByRole("menuitem", { name: "Save As" }).click();
    const saveDialog = page.getByRole("dialog", { name: "Save project as" });
    await saveDialog.getByLabel("Project name").fill("Phase 2 Regression Copy");
    await saveDialog.getByRole("button", { name: "Save copy" }).click();
    await page.getByText("Saved on this browser", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Brush", exact: true }).last().click();
    const canvas = await editable.boundingBox();
    assert.ok(canvas);
    await page.mouse.move(canvas.x + canvas.width * 0.49, canvas.y + canvas.height * 0.48);
    await page.mouse.down();
    await page.mouse.move(canvas.x + canvas.width * 0.53, canvas.y + canvas.height * 0.54, { steps: 6 });
    await page.mouse.up();
    await page.getByRole("button", { name: "File" }).click();
    await page.getByRole("menuitem", { name: "Save and Exit", exact: true }).click();
    await page.getByRole("button", { name: /^My Projects/ }).waitFor();
    equal(await page.getByRole("dialog", { name: /Unsaved work found/i }).count(), 0, "successful Save and Exit leaves no recovery prompt");
    await page.getByRole("button", { name: /^My Projects/ }).click();
    const savedCard = page.getByRole("button", { name: "Watch Phase 2 Regression Copy", exact: true });
    await savedCard.waitFor({ timeout: 30_000 });
    await page.getByRole("button", { name: "← Back" }).click();
    await page.getByRole("button", { name: /^Export/ }).click();
    await page.getByRole("main", { name: "Choose a saved animation to export" }).waitFor();
    const exportCard = page.getByRole("button", { name: /Phase 2 Regression Copy/ });
    await exportCard.waitFor({ timeout: 30_000 });
    await exportCard.click();
    await page.getByRole("button", { name: "Use this animation" }).click();
    await page.locator('[data-canonical-project-player="export"]').waitFor();
    equal(await page.locator('[data-canonical-project-player="export"]').count(), 1, "Export continues consuming the shared canonical player");
    check(await page.getByRole("button", { name: "Export video" }).isVisible(), "Export encoding action remains available");
    await page.getByRole("button", { name: "Change animation" }).click();
    await page.getByRole("button", { name: "← Back" }).click();
    await page.getByRole("button", { name: /^My Projects/ }).waitFor();
  });
  desktopAudioStats = await audioControl(page, "stats");
  await desktop.close();

  const invalidationContext = await browser.newContext({ viewport: { width: 1200, height: 800 }, serviceWorkers: "block" });
  await configure(invalidationContext);
  const invalidationPage = await invalidationContext.newPage();
  attachErrors(invalidationPage);
  const invalidationCard = await openLibrary(invalidationPage);
  await step("source-invalidation:stop-and-disclose", async () => {
    const dialog = await openViewer(invalidationPage, invalidationCard);
    await dialog.getByRole("button", { name: "Play animation" }).click();
    await dialog.getByRole("button", { name: "Pause animation" }).waitFor();
    const beforeInvalidation = await audioControl(invalidationPage, "stats") as { contexts: number; closes: number; stops: number; disconnects: number };
    await invalidationPage.evaluate(async () => {
      const database = await new Promise<IDBDatabase>((resolveDatabase, rejectDatabase) => {
        const open = indexedDB.open("diamond-animator-local");
        open.onsuccess = () => resolveDatabase(open.result);
        open.onerror = () => rejectDatabase(open.error);
      });
      await new Promise<void>((resolveTransaction, rejectTransaction) => {
        const transaction = database.transaction("drawingProjectVersionsV2", "readwrite");
        transaction.objectStore("drawingProjectVersionsV2").clear();
        transaction.oncomplete = () => resolveTransaction();
        transaction.onerror = () => rejectTransaction(transaction.error);
      });
      database.close();
      window.dispatchEvent(new Event("focus"));
    });
    await dialog.waitFor({ state: "detached" });
    await invalidationPage.getByRole("status").filter({ hasText: /changed|deleted|unavailable/i }).waitFor();
    await invalidationPage.waitForFunction(() => {
      const stats = (window as unknown as { __phase2Audio: { state: { contexts: number; closes: number } } }).__phase2Audio.state;
      return stats.closes === stats.contexts;
    });
    const afterInvalidation = await audioControl(invalidationPage, "stats") as { contexts: number; closes: number; stops: number; disconnects: number };
    equal(afterInvalidation.closes, afterInvalidation.contexts, "source invalidation closes the active AudioContext");
    check(afterInvalidation.stops > beforeInvalidation.stops, "source invalidation stops obsolete scheduled audio");
    check(afterInvalidation.disconnects > beforeInvalidation.disconnects, "source invalidation disconnects obsolete scheduled audio");
    sourceInvalidationEvidence = { before: beforeInvalidation, after: afterInvalidation, disclosureVisible: true };
  });
  await invalidationContext.close();

  for (const profile of [
    { id: "compact-reduced", viewport: { width: 390, height: 844 }, dpr: 2, reducedMotion: "reduce" as const, forcedColors: "none" as const, colorScheme: "dark" as const },
    { id: "narrow", viewport: { width: 320, height: 568 }, dpr: 1, reducedMotion: "no-preference" as const, forcedColors: "none" as const, colorScheme: "dark" as const },
    { id: "zoom-200", viewport: { width: 720, height: 450 }, dpr: 1, reducedMotion: "no-preference" as const, forcedColors: "none" as const, colorScheme: "dark" as const },
    { id: "high-contrast", viewport: { width: 1024, height: 768 }, dpr: 1, reducedMotion: "no-preference" as const, forcedColors: "active" as const, colorScheme: "dark" as const },
  ]) {
    const context = await browser.newContext({ viewport: profile.viewport, deviceScaleFactor: profile.dpr, reducedMotion: profile.reducedMotion, forcedColors: profile.forcedColors, colorScheme: profile.colorScheme, serviceWorkers: "block" });
    await configure(context);
    const profilePage = await context.newPage();
    attachErrors(profilePage);
    const profileCard = await openLibrary(profilePage);
    const dialog = await openViewer(profilePage, profileCard);
    await step(`${profile.id}:responsive-contain-and-controls`, async () => {
      await assertNoOverflow(profilePage, profile.id);
      const box = await dialog.boundingBox();
      assert.ok(box);
      check(box.width <= profile.viewport.width - 15 && box.height <= profile.viewport.height - 15, `${profile.id} keeps the compact 8px inset`);
      const geometry = await dialog.locator("canvas").evaluate(canvas => {
        const element = canvas as HTMLCanvasElement;
        const rect = element.getBoundingClientRect();
        return { backingWidth: element.width, backingHeight: element.height, cssWidth: rect.width, cssHeight: rect.height };
      });
      close(geometry.cssWidth / geometry.cssHeight, 16 / 9, 0.004, `${profile.id} canvas retains saved aspect`);
      check(geometry.backingWidth <= 4096 && geometry.backingHeight <= 4096, `${profile.id} backing store remains capped`);
      check(await dialog.getByRole("button", { name: "Close" }).isVisible(), `${profile.id} Close remains visible`);
      check(await dialog.getByRole("button", { name: "Play animation" }).isVisible(), `${profile.id} Play remains visible`);
      check(await dialog.getByRole("button", { name: "Enter fullscreen" }).isVisible(), `${profile.id} Fullscreen remains visible`);
      await assertViewerSurfaceUnobstructed(profilePage, `${profile.id} viewer`);
      if (profile.reducedMotion === "reduce") {
        equal(await dialog.locator('[data-player-controls-visible]').evaluate(element => getComputedStyle(element).transitionDuration), "0s", "reduced motion removes chrome transition");
      }
      await screenshot(profilePage, profile.id);
    });
    await dialog.getByRole("button", { name: "Close" }).click();
    await context.close();
  }

  const terraContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
  await configure(terraContext, "natural");
  const terraPage = await terraContext.newPage();
  attachErrors(terraPage);
  await step("terra:exact-hi-json-and-natural-reply", async () => {
    await terraPage.goto(url, { waitUntil: "networkidle" });
    await terraPage.getByRole("button", { name: /^New Project/ }).click();
    const composer = terraPage.getByRole("textbox", { name: "Message AI Animator" });
    await composer.waitFor({ timeout: 30_000 });
    await composer.fill("hi");
    await composer.press("Enter");
    const visualReply = terraPage.locator('[data-ai-assistant-visual]').filter({ hasText: "Hi! I’m Terra. What would you like help with?" });
    await visualReply.waitFor({ timeout: 10_000 });
    equal(await visualReply.textContent(), "Hi! I’m Terra. What would you like help with?", "exact hi produces a natural Terra reply");
    const pageText = await terraPage.locator("body").innerText();
    check(!pageText.includes("Unexpected token"), "exact hi never exposes a JSON parser exception");
    check(!pageText.includes("<!DOCTYPE"), "exact hi never exposes an HTML document fragment");
    check(!pageText.includes("not valid JSON"), "exact hi never exposes raw JSON parsing language");
    const naturalReceipts = terraResponseReceipts.filter(receipt => receipt.mode === "natural");
    check(naturalReceipts.some(receipt => receipt.method === "POST" && receipt.status === 202 && receipt.contentType === "application/json"), "exact hi captures the JSON 202 submit response");
    check(naturalReceipts.some(receipt => receipt.method === "GET" && receipt.status === 200 && receipt.contentType === "application/json"), "exact hi captures the JSON 200 completion response");
    terraHiEvidence = { message: "hi", naturalReplyVisible: true, receipts: naturalReceipts, providerInvoked: false };
    await screenshot(terraPage, "terra-hi-natural-reply");
  });
  await terraContext.close();

  const nonJsonContext = await browser.newContext({ viewport: { width: 1200, height: 800 }, serviceWorkers: "block" });
  await configure(nonJsonContext, "html-failure");
  const nonJsonPage = await nonJsonContext.newPage();
  attachErrors(nonJsonPage);
  await step("terra:non-json-response-is-sanitized", async () => {
    await nonJsonPage.goto(url, { waitUntil: "networkidle" });
    await nonJsonPage.getByRole("button", { name: /^New Project/ }).click();
    const composer = nonJsonPage.getByRole("textbox", { name: "Message AI Animator" });
    await composer.waitFor({ timeout: 30_000 });
    await composer.fill("hi");
    await composer.press("Enter");
    const safeFailure = nonJsonPage.locator('[data-ai-assistant-visual]').filter({ hasText: "Terra service returned an unexpected 404 response." });
    await safeFailure.waitFor({ timeout: 10_000 });
    const pageText = await nonJsonPage.locator("body").innerText();
    check(pageText.includes("No animation changed."), "non-JSON failure retains the no-mutation guarantee");
    check(!pageText.includes("Unexpected token"), "non-JSON failure hides the JavaScript parser exception");
    check(!pageText.includes("<!DOCTYPE"), "non-JSON failure hides the response body");
    check(!pageText.includes("not valid JSON"), "non-JSON failure hides raw JSON parsing language");
  });
  await nonJsonContext.close();

  const acceptedConsoleBaseline = consoleErrors.filter(message => /404 \(Not Found\).*\/favicon\.ico\?/.test(message));
  const acceptedDeterministicNonJsonFailures = consoleErrors.filter(message => /404 \(Not Found\).*\/api\/ai-animator(?:\?|$)/.test(message));
  const unexpectedConsoleErrors = consoleErrors.filter(message => !acceptedConsoleBaseline.includes(message) && !acceptedDeterministicNonJsonFailures.includes(message));
  equal(pageErrors, [], "real browser produced zero page errors");
  equal(unexpectedConsoleErrors, [], "real browser produced zero unexpected console errors");
  check(acceptedConsoleBaseline.length <= 1, "only the exact inherited missing-favicon 404 baseline is accepted");
  equal(acceptedDeterministicNonJsonFailures.length, 2, "only the deliberate POST and reconnect HTML 404 proof responses are accepted");
  equal(requests.filter(request => request.disposition === "blocked"), [], "proof produced zero external/provider requests");
  writeFileSync(resolve(outputRoot, "requests.json"), `${JSON.stringify(requests, null, 2)}\n`);

  const result = {
    kind: "spec0011-phase2-browser",
    version: 1,
    status: "PASS",
    assertions,
    operations,
    screenshots,
    audio: desktopAudioStats,
    sourceInvalidation: sourceInvalidationEvidence,
    performance: performanceEvidence,
    aiAnimator: {
      productionRoute: productionAiRouteEvidence,
      exactHi: terraHiEvidence,
      deterministicResponseReceipts: terraResponseReceipts,
    },
    requests: {
      total: requests.length,
      blocked: requests.filter(request => request.disposition === "blocked").length,
      providerOrPaid: 0,
    },
    errors: { page: pageErrors, unexpectedConsole: unexpectedConsoleErrors, acceptedConsoleBaseline, acceptedDeterministicNonJsonFailures },
    storage: storageEvidence,
    storageUnchanged: true,
  };
  writeFileSync(resolve(outputRoot, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
