import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright-core";
import { createPhase1LegacyFixtureTransport } from "../spec0011-project-library/phase1Fixtures.ts";

const origin = "http://127.0.0.1:57950";
const output = resolve("output/spec-0012/phase-1-correction/browser");
mkdirSync(output, { recursive: true });
if (process.argv.includes("--sidebar-resize-review")) {
  const reviewAssertions: string[] = [];
  const reviewRequests: Array<{ method: string; path: string; disposition: string }> = [];
  const reviewMutations: string[] = [];
  const reviewErrors: string[] = [];
  const reviewScreenshots: string[] = [];
  const reviewEqual = (actual: unknown, expected: unknown, label: string) => { assert.deepEqual(actual, expected, label); reviewAssertions.push(label); };
  const reviewCheck = (value: unknown, label: string) => { assert.ok(value, label); reviewAssertions.push(label); };
  const reviewBrowser = await chromium.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: !process.argv.includes("--headed"),
    args: ["--disable-background-networking", "--disable-component-update", "--disable-sync", "--no-first-run"],
  });
  try {
    const context = await reviewBrowser.newContext({ viewport: { width: 1440, height: 814 } });
    await context.route("**/*", async route => {
      const request = route.request();
      const url = new URL(request.url());
      const allowed = url.origin === origin && !url.pathname.startsWith("/api/");
      reviewRequests.push({ method: request.method(), path: `${url.origin}${url.pathname}`, disposition: allowed ? "local-asset-or-navigation" : "blocked" });
      if (allowed) await route.continue(); else await route.abort();
    });
    await context.exposeBinding("phase1SidebarMutation", (_, kind: string) => { reviewMutations.push(kind); });
    await context.addInitScript(() => {
      const report = (kind: string) => { void (window as unknown as { phase1SidebarMutation: (kind: string) => Promise<void> }).phase1SidebarMutation(kind); };
      for (const method of ["setItem", "removeItem", "clear"] as const) {
        const original = Storage.prototype[method];
        Object.defineProperty(Storage.prototype, method, { value: function (...args: string[]) { report(`Storage.${method}`); return Reflect.apply(original, this, args); } });
      }
      for (const method of ["put", "add", "delete", "clear"] as const) {
        const original = IDBObjectStore.prototype[method];
        Object.defineProperty(IDBObjectStore.prototype, method, { value: function (...args: unknown[]) { report(`IndexedDB.${method}`); return Reflect.apply(original, this, args); } });
      }
      if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => { report("microphone-permission"); throw new Error("Microphone is outside Phase 1"); };
    });
    const page = await context.newPage();
    page.on("pageerror", error => reviewErrors.push(error.message));
    page.on("console", message => { if (message.type() === "error") reviewErrors.push(message.text()); });
    const separator = page.getByRole("separator", { name: "Resize chat sessions sidebar" });
    const inspect = () => page.locator("[data-assistant-screen]").evaluate(screen => {
      const sidebar = document.querySelector('aside[aria-label="Chat sessions"]')!;
      const main = document.querySelector("#assistant-conversation-main")!;
      const handle = document.querySelector("[data-assistant-sidebar-resizer]")!;
      const hero = document.querySelector('section[aria-label="Conversation"] svg')!.parentElement!;
      const heroSvg = hero.querySelector("svg")!;
      const brand = document.querySelector('aside[aria-label="Chat sessions"] svg')!.parentElement!;
      const brandSvg = brand.querySelector("svg")!;
      const composerArea = document.querySelector('form[aria-label="Message composer"]')!.parentElement!;
      const composer = document.querySelector('form[aria-label="Message composer"]')!;
      const heading = document.querySelector("h1")!;
      const rect = (element: Element) => { const value = element.getBoundingClientRect(); return { x: value.x, y: value.y, width: value.width, height: value.height, right: value.right, bottom: value.bottom }; };
      const headingStyle = getComputedStyle(heading);
      const headingLines = Array.from(heading.querySelectorAll<HTMLElement>(":scope > span")).map(line => {
        const clone = line.cloneNode(true) as HTMLElement;
        Object.assign(clone.style, { position: "fixed", visibility: "hidden", width: "max-content", maxWidth: "none", whiteSpace: "nowrap", textWrap: "nowrap" });
        heading.appendChild(clone);
        const naturalWidth = clone.getBoundingClientRect().width;
        clone.remove();
        return { text: line.textContent, naturalWidth, ...rect(line) };
      });
      const back = document.querySelector('a[href="/#ai-assistant"]')!;
      const mainRect = rect(main);
      const composerRect = rect(composer);
      const headingRect = rect(heading);
      const backRect = rect(back);
      return {
        viewport: { width: innerWidth, height: innerHeight },
        sidebar: rect(sidebar), main: mainRect, handle: { ...rect(handle), display: getComputedStyle(handle).display, active: handle.getAttribute("data-resizing"), lineColor: getComputedStyle(handle, "::before").backgroundColor, lineShadow: getComputedStyle(handle, "::before").boxShadow },
        aria: { min: handle.getAttribute("aria-valuemin"), max: handle.getAttribute("aria-valuemax"), now: handle.getAttribute("aria-valuenow"), orientation: handle.getAttribute("aria-orientation"), controls: handle.getAttribute("aria-controls") },
        body: { cursor: getComputedStyle(document.body).cursor, userSelect: getComputedStyle(document.body).userSelect },
        screen: { userSelect: getComputedStyle(screen).userSelect },
        hero: { color: getComputedStyle(hero).color, stroke: getComputedStyle(heroSvg).stroke, opacity: getComputedStyle(hero).opacity, filter: getComputedStyle(hero).filter, ...rect(hero), path: heroSvg.querySelector("path")?.getAttribute("d") },
        brand: { color: getComputedStyle(brand).color, stroke: getComputedStyle(brandSvg).stroke, opacity: getComputedStyle(brand).opacity, ...rect(brand), path: brandSvg.querySelector("path")?.getAttribute("d") },
        composerArea: rect(composerArea), composer: composerRect,
        heading: { accessibleName: heading.getAttribute("aria-label"), lineHeight: Number.parseFloat(headingStyle.lineHeight), box: headingRect, lines: headingLines },
        reflow: { composerInsideMain: composerRect.x >= mainRect.x && composerRect.right <= mainRect.right, headingInsideMain: headingRect.x >= mainRect.x && headingRect.right <= mainRect.right, backInsideMain: backRect.x >= mainRect.x && backRect.right <= mainRect.right },
        overflow: { horizontal: document.documentElement.scrollWidth > innerWidth, vertical: document.documentElement.scrollHeight > innerHeight },
      };
    });
    const snapshot = async (name: string) => { const file = `sidebar-resize-${name}.png`; await page.screenshot({ path: resolve(output, file) }); reviewScreenshots.push(file); };
    const verifyDesktopHeading = (value: Awaited<ReturnType<typeof inspect>>, label: string) => {
      reviewEqual(value.heading.accessibleName, "How can I help you with Diamond Animator today?", `${label}: heading accessible name remains one natural sentence`);
      reviewEqual(value.heading.lines.map(line => line.text), ["How can I help you with", "Diamond Animator today?"], `${label}: heading uses the exact two visual lines`);
      reviewCheck(value.heading.lines.every(line => line.height <= value.heading.lineHeight + 1), `${label}: each intentional desktop line remains unwrapped`);
      reviewCheck(value.heading.lines[1].y >= value.heading.lines[0].bottom - 1 && value.heading.box.height <= value.heading.lineHeight * 2 + 2, `${label}: heading renders as exactly two stacked lines`);
    };
    const dragTo = async (targetX: number, hold = false) => {
      const box = await separator.boundingBox();
      assert.ok(box);
      await page.mouse.move(box.x + box.width / 2, box.y + Math.min(300, box.height / 2));
      await page.mouse.down();
      await page.mouse.move(targetX, box.y + Math.min(300, box.height / 2), { steps: 10 });
      await page.waitForTimeout(40);
      if (!hold) await page.mouse.up();
    };

    await page.goto(`${origin}/assistant`);
    await page.getByRole("heading", { level: 1 }).waitFor();
    await separator.waitFor();
    const initial = await inspect();
    reviewEqual(initial.viewport, { width: 1440, height: 814 }, "desktop review uses exact 1440x814 viewport");
    reviewEqual([initial.sidebar.width, initial.main.x], [256, 256], "desktop sidebar default remains exactly 256 pixels");
    reviewEqual([initial.handle.width, initial.handle.display, initial.handle.lineColor], [16, "block", "rgba(0, 0, 0, 0)"], "default divider has a comfortable invisible hit target");
    reviewEqual(initial.aria, { min: "200", max: "440", now: "256", orientation: "vertical", controls: "assistant-conversation-main" }, "separator exposes exact accessible bounds and ownership");
    reviewEqual([initial.hero.width, initial.hero.height, initial.hero.color, initial.hero.stroke, initial.hero.opacity, initial.hero.path], [118, 118, "rgb(255, 255, 255)", "rgb(255, 255, 255)", "0.28", "M3 9l4-5h10l4 5-9 11L3 9z"], "desktop hero identity is unchanged before resizing");
    reviewCheck(/rgba\(64, 142, 255, 0\.12\).*14px 30px/.test(initial.hero.filter), "desktop hero blue glow is unchanged before resizing");
    reviewEqual([initial.brand.width, initial.brand.height, initial.brand.color, initial.brand.stroke, initial.brand.opacity, initial.brand.path], [32, 32, "rgb(255, 255, 255)", "rgb(255, 255, 255)", "1", "M3 9l4-5h10l4 5-9 11L3 9z"], "desktop brand identity is unchanged before resizing");
    reviewEqual(initial.reflow, { composerInsideMain: true, headingInsideMain: true, backInsideMain: true }, "default header, greeting, and composer fit the conversation area");
    verifyDesktopHeading(initial, "default width");
    reviewEqual(initial.overflow, { horizontal: false, vertical: false }, "default layout has no page overflow");
    await snapshot("default");

    await separator.hover();
    await page.waitForTimeout(160);
    const hover = await inspect();
    reviewEqual(hover.handle.lineColor, "rgb(98, 166, 255)", "hover reveals the cool-blue divider");
    reviewCheck(/rgba\(64, 142, 255, 0\.48\)/.test(hover.handle.lineShadow), "hover reveals the restrained blue glow");

    await dragTo(360, true);
    const active = await inspect();
    reviewEqual([active.sidebar.width, active.handle.active, active.handle.lineColor], [360, "true", "rgb(98, 166, 255)"], "active pointer drag resizes smoothly and keeps the blue divider visible");
    reviewEqual([active.body.cursor, active.body.userSelect, active.screen.userSelect], ["col-resize", "none", "none"], "active drag prevents text selection and owns the resize cursor");
    reviewEqual([active.hero.width, active.hero.height, active.hero.color, active.hero.opacity, active.hero.filter], [initial.hero.width, initial.hero.height, initial.hero.color, initial.hero.opacity, initial.hero.filter], "hero appearance is identical during drag");
    reviewEqual(active.reflow, { composerInsideMain: true, headingInsideMain: true, backInsideMain: true }, "header, greeting, and composer reflow during drag");
    await snapshot("active-mid");
    await page.mouse.up();
    await page.waitForTimeout(40);
    const released = await inspect();
    reviewEqual([released.sidebar.width, released.handle.active, released.body.userSelect], [360, "false", "auto"], "pointer release preserves width and safely restores selection");

    await dragTo(100);
    const minimum = await inspect();
    reviewEqual([minimum.sidebar.width, minimum.aria.now], [200, "200"], "pointer drag clamps at the 200 pixel minimum");
    reviewEqual(minimum.reflow, { composerInsideMain: true, headingInsideMain: true, backInsideMain: true }, "minimum width preserves natural conversation reflow");
    verifyDesktopHeading(minimum, "minimum width");
    await snapshot("minimum");

    await dragTo(600);
    const maximum = await inspect();
    reviewEqual([maximum.sidebar.width, maximum.aria.now], [440, "440"], "pointer drag clamps at the 440 pixel maximum");
    reviewCheck(maximum.main.width >= 560, "maximum sidebar preserves the safe conversation width");
    reviewEqual([maximum.hero.width, maximum.hero.height, maximum.hero.color, maximum.hero.opacity, maximum.hero.filter], [initial.hero.width, initial.hero.height, initial.hero.color, initial.hero.opacity, initial.hero.filter], "hero appearance is identical at maximum width");
    reviewEqual(maximum.reflow, { composerInsideMain: true, headingInsideMain: true, backInsideMain: true }, "maximum width shifts all conversation content without clipping");
    verifyDesktopHeading(maximum, "maximum width");
    await snapshot("maximum");

    await dragTo(320);
    const middle = await inspect();
    reviewEqual([middle.sidebar.width, middle.aria.now], [320, "320"], "pointer drag returns to a stable mid width");
    verifyDesktopHeading(middle, "mid width");
    await snapshot("middle");
    await separator.focus();
    await page.waitForTimeout(160);
    const focused = await inspect();
    reviewEqual(focused.handle.lineColor, "rgb(98, 166, 255)", "keyboard focus reveals the cool-blue divider");
    await page.keyboard.press("Home");
    reviewEqual((await inspect()).sidebar.width, 200, "Home moves the separator to its minimum");
    await page.keyboard.press("ArrowLeft");
    reviewEqual((await inspect()).sidebar.width, 200, "ArrowLeft cannot pass the minimum");
    await page.keyboard.press("ArrowRight");
    reviewEqual((await inspect()).sidebar.width, 212, "ArrowRight advances by the 12 pixel keyboard step");
    await page.keyboard.press("End");
    reviewEqual((await inspect()).sidebar.width, 440, "End moves the separator to its maximum");
    await page.keyboard.press("ArrowRight");
    reviewEqual((await inspect()).sidebar.width, 440, "ArrowRight cannot pass the maximum");
    await page.keyboard.press("ArrowLeft");
    reviewEqual((await inspect()).sidebar.width, 428, "ArrowLeft retreats by the 12 pixel keyboard step");

    await dragTo(390, true);
    await separator.dispatchEvent("pointercancel", { pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0 });
    await page.mouse.up();
    await page.waitForTimeout(40);
    const cancelled = await inspect();
    reviewEqual([cancelled.handle.active, cancelled.body.userSelect], ["false", "auto"], "pointer cancel safely ends resizing and restores selection");

    await page.reload();
    await separator.waitFor();
    const reloaded = await inspect();
    reviewEqual([reloaded.sidebar.width, reloaded.aria.now], [256, "256"], "reload restores the default because sidebar width is not persisted");
    await page.setViewportSize({ width: 800, height: 814 });
    await page.waitForTimeout(80);
    const constrained = await inspect();
    reviewEqual([constrained.sidebar.width, constrained.aria.max, constrained.main.width], [240, "240", 560], "narrow desktop clamps the rail to preserve a 560 pixel conversation area");
    reviewCheck(constrained.composerArea.width < initial.composerArea.width && constrained.composerArea.width === constrained.main.width, "composer shrinks naturally with constrained main width");
    reviewEqual(constrained.reflow, { composerInsideMain: true, headingInsideMain: true, backInsideMain: true }, "constrained desktop keeps header, greeting, and composer inside the main area");
    reviewEqual(constrained.overflow, { horizontal: false, vertical: false }, "constrained desktop has no page overflow");
    reviewEqual([constrained.hero.width, constrained.hero.height, constrained.hero.color, constrained.hero.opacity, constrained.hero.filter], [initial.hero.width, initial.hero.height, initial.hero.color, initial.hero.opacity, initial.hero.filter], "constrained desktop preserves the hero exactly");
    await snapshot("constrained-desktop");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(80);
    const mobile = await inspect();
    reviewEqual([mobile.viewport.width, mobile.sidebar.width, mobile.handle.display], [390, 390, "none"], "compact layout remains a full-width top strip with no resize handle");
    reviewEqual([mobile.hero.width, mobile.hero.height, mobile.hero.color, mobile.hero.opacity, mobile.hero.path], [82, 82, initial.hero.color, initial.hero.opacity, initial.hero.path], "compact hero retains its accepted responsive identity");
    reviewEqual([mobile.heading.accessibleName, mobile.heading.lines.map(line => line.text)], ["How can I help you with Diamond Animator today?", ["How can I help you with", "Diamond Animator today?"]], "compact heading preserves the sentence and visual line ownership");
    reviewCheck(mobile.heading.lines.every(line => line.height <= mobile.heading.lineHeight + 1 || line.naturalWidth > line.width), "compact heading wraps a visual line further only when its natural width exceeds the available width");
    reviewCheck(mobile.heading.box.x >= mobile.main.x && mobile.heading.box.right <= mobile.main.right && mobile.heading.box.bottom <= mobile.main.bottom, "compact heading remains unclipped and readable when its visual lines wrap further");
    reviewEqual(mobile.overflow, { horizontal: false, vertical: false }, "compact layout has no page overflow");
    await snapshot("mobile");

    await page.waitForTimeout(80);
    reviewEqual(reviewMutations, [], "resizing makes zero storage or microphone mutations");
    reviewEqual(reviewRequests.filter(entry => entry.disposition === "blocked"), [], "resizing makes zero API, provider, search, transcription, or external requests");
    reviewEqual(reviewErrors, [], "sidebar resize proof has no page or console errors");
    const result = { status: "PASS", assertions: reviewAssertions, screenshots: reviewScreenshots, initial, hover, active, released, minimum, maximum, middle, focused, cancelled, reloaded, constrained, mobile, requestLedger: reviewRequests, mutationLedger: reviewMutations, errors: reviewErrors, assistantApiRequests: 0, providerRequests: 0, searchRequests: 0, transcriptionRequests: 0, paidCalls: 0 };
    writeFileSync(resolve(output, "sidebar-resize-review.json"), `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify({ status: result.status, assertions: result.assertions.length, screenshots: result.screenshots.length }));
    await context.close();
  } finally {
    await reviewBrowser.close();
  }
  process.exit(0);
}
if (process.argv.includes("--icon-color-review")) {
  const reviewAssertions: string[] = [];
  const reviewRequests: Array<{ method: string; path: string; disposition: string }> = [];
  const reviewErrors: string[] = [];
  const reviewEqual = (actual: unknown, expected: unknown, label: string) => { assert.deepEqual(actual, expected, label); reviewAssertions.push(label); };
  const reviewCheck = (value: unknown, label: string) => { assert.ok(value, label); reviewAssertions.push(label); };
  const reviewBrowser = await chromium.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: !process.argv.includes("--headed"),
    args: ["--disable-background-networking", "--disable-component-update", "--disable-sync", "--no-first-run"],
  });
  try {
    const context = await reviewBrowser.newContext({
      viewport: { width: 1440, height: 814 },
      storageState: { cookies: [], origins: [{ origin, localStorage: [{ name: "da_welcome_seen", value: "1" }, { name: "da_welcome_never_show", value: "1" }] }] },
    });
    await context.route("**/*", async route => {
      const request = route.request();
      const url = new URL(request.url());
      const allowed = url.origin === origin && !url.pathname.startsWith("/api/");
      reviewRequests.push({ method: request.method(), path: `${url.origin}${url.pathname}`, disposition: allowed ? "local-asset-or-navigation" : "blocked" });
      if (allowed) await route.continue(); else await route.abort();
    });
    const page = await context.newPage();
    page.on("pageerror", error => reviewErrors.push(error.message));
    page.on("console", message => { if (message.type() === "error") reviewErrors.push(message.text()); });
    await page.goto(origin);
    await page.getByRole("button", { name: "AI Assistant Ask questions and get guidance." }).click();
    await page.waitForURL(`${origin}/assistant`);
    await page.getByRole("heading", { level: 1 }).waitFor();
    const presentation = await page.locator("[data-assistant-screen]").evaluate(() => {
      const hero = document.querySelector('section[aria-label="Conversation"] svg')!.parentElement!;
      const heroSvg = hero.querySelector("svg")!;
      const brand = document.querySelector('aside[aria-label="Chat sessions"] svg')!.parentElement!;
      const brandSvg = brand.querySelector("svg")!;
      const heroBox = hero.getBoundingClientRect();
      const brandBox = brand.getBoundingClientRect();
      return {
        viewport: { width: innerWidth, height: innerHeight },
        hero: { color: getComputedStyle(hero).color, stroke: getComputedStyle(heroSvg).stroke, opacity: getComputedStyle(hero).opacity, filter: getComputedStyle(hero).filter, width: heroBox.width, height: heroBox.height },
        brand: { color: getComputedStyle(brand).color, stroke: getComputedStyle(brandSvg).stroke, opacity: getComputedStyle(brand).opacity, width: brandBox.width, height: brandBox.height },
        overflow: { horizontal: document.documentElement.scrollWidth > innerWidth, vertical: document.documentElement.scrollHeight > innerHeight },
      };
    });
    reviewEqual(presentation.viewport, { width: 1440, height: 814 }, "exact 1440x814 review viewport");
    reviewEqual([presentation.hero.color, presentation.hero.stroke], ["rgb(255, 255, 255)", "rgb(255, 255, 255)"], "hero diamond uses a white stroke");
    reviewEqual(presentation.hero.opacity, "0.28", "hero diamond preserves 0.28 translucency");
    reviewCheck(/rgba\(64, 142, 255, 0\.12\).*14px 30px/.test(presentation.hero.filter), "hero diamond preserves the subtle blue glow");
    reviewEqual([presentation.brand.color, presentation.brand.stroke, presentation.brand.opacity], ["rgb(255, 255, 255)", "rgb(255, 255, 255)", "1"], "sidebar brand diamond uses a solid white stroke");
    reviewEqual([presentation.hero.width, presentation.hero.height, presentation.brand.width, presentation.brand.height], [118, 118, 32, 32], "diamond geometry and size remain unchanged");
    reviewEqual(presentation.overflow, { horizontal: false, vertical: false }, "review viewport has no page overflow");
    reviewEqual(reviewRequests.filter(entry => entry.disposition === "blocked"), [], "review made no API, provider, search, transcription, or external request");
    reviewEqual(reviewErrors, [], "review produced no page or console errors");
    const screenshot = "icon-color-review-viewport.png";
    await page.screenshot({ path: resolve(output, screenshot) });
    const result = { status: "PASS", assertions: reviewAssertions, viewport: presentation.viewport, presentation, screenshot, requestLedger: reviewRequests, errors: reviewErrors, assistantApiRequests: 0, providerRequests: 0, searchRequests: 0, transcriptionRequests: 0, paidCalls: 0 };
    writeFileSync(resolve(output, "icon-color-review.json"), `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify({ status: result.status, assertions: result.assertions.length, screenshot }));
    await context.close();
  } finally {
    await reviewBrowser.close();
  }
  process.exit(0);
}
const assertions: string[] = [];
const requests: Array<{ group: string; method: string; path: string; disposition: string }> = [];
const mutations: Array<{ group: string; kind: string }> = [];
const errors: string[] = [];
const screenshots: string[] = [];
const storage: Array<{ profile: string; before: string; after: string; inventory: unknown }> = [];
const accessibility: Array<{ profile: string; violations: unknown[] }> = [];
const timings: Array<{ profile: string; navigationMs: number }> = [];
const presentation: Array<{
  profile: string;
  layout: "sidebar" | "top-strip";
  composerHeight: number;
  heroOpacity: string;
  textareaOutline: string;
  composerFocusBorder: string;
  composerBottomGap: number;
  areaBottomGap: number;
}> = [];
let group = "setup";
const equal = (a: unknown, b: unknown, label: string) => { assert.deepEqual(a, b, label); assertions.push(label); };
const check = (value: unknown, label: string) => { assert.ok(value, label); assertions.push(label); };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: !process.argv.includes("--headed"),
  args: ["--disable-background-networking", "--disable-component-update", "--disable-sync", "--no-first-run"],
});

const configure = async (context: BrowserContext) => {
  await context.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const allowed = url.origin === origin && !url.pathname.startsWith("/api/");
    const mockAvailability = group === "protected" && url.origin === origin && url.pathname === "/api/ai" && request.method() === "GET";
    const disposition = allowed ? "local-asset-or-navigation" : mockAvailability ? "mocked-legacy-availability" : "blocked";
    requests.push({ group, method: request.method(), path: `${url.origin}${url.pathname}`, disposition });
    if (mockAvailability) await route.fulfill({ status: 200, contentType: "application/json", body: '{"available":false}' });
    else if (allowed) await route.continue();
    else await route.abort();
  });
  await context.exposeBinding("phase1Mutation", (_, kind: string) => { mutations.push({ group, kind }); });
  await context.addInitScript(() => {
    const report = (kind: string) => { void (window as unknown as { phase1Mutation: (kind: string) => Promise<void> }).phase1Mutation(kind); };
    for (const method of ["setItem", "removeItem", "clear"] as const) {
      const original = Storage.prototype[method];
      // Instrument writes without suppressing them, including writes of identical bytes.
      Object.defineProperty(Storage.prototype, method, { value: function (...args: string[]) { report(`Storage.${method}`); return Reflect.apply(original, this, args); } });
    }
    for (const method of ["put", "add", "delete", "clear"] as const) {
      const original = IDBObjectStore.prototype[method];
      Object.defineProperty(IDBObjectStore.prototype, method, { value: function (...args: unknown[]) { report(`IndexedDB.${method}`); return Reflect.apply(original, this, args); } });
    }
    const originalDelete = IDBFactory.prototype.deleteDatabase;
    IDBFactory.prototype.deleteDatabase = function (name) { report("IndexedDB.deleteDatabase"); return originalDelete.call(this, name); };
    if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => { report("microphone-permission"); throw new Error("Microphone is outside Phase 1"); };
  });
  context.on("page", page => {
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  });
};

const inventory = (page: Page) => page.evaluate(async () => {
  const normalize = async (value: unknown): Promise<unknown> => {
    if (value instanceof Blob) return { blobType: value.type, bytes: Array.from(new Uint8Array(await value.arrayBuffer())) };
    if (value instanceof ArrayBuffer) return Array.from(new Uint8Array(value));
    if (ArrayBuffer.isView(value)) return Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
    if (Array.isArray(value)) return Promise.all(value.map(normalize));
    if (value && typeof value === "object") return Object.fromEntries(await Promise.all(Object.entries(value).sort().map(async ([key, item]) => [key, await normalize(item)])));
    return value;
  };
  const indexed: Record<string, unknown> = {};
  for (const entry of (await indexedDB.databases()).sort((a, b) => String(a.name).localeCompare(String(b.name)))) {
    const db = await new Promise<IDBDatabase>((resolveDb, reject) => { const request = indexedDB.open(entry.name!); request.onsuccess = () => resolveDb(request.result); request.onerror = () => reject(request.error); });
    const stores: Record<string, unknown> = {};
    for (const name of Array.from(db.objectStoreNames)) {
      const values = await new Promise<unknown[]>((resolveValues, reject) => { const request = db.transaction(name, "readonly").objectStore(name).getAll(); request.onsuccess = () => resolveValues(request.result); request.onerror = () => reject(request.error); });
      stores[name] = await normalize(values);
    }
    indexed[entry.name!] = { version: db.version, stores };
    db.close();
  }
  return { local: Object.fromEntries(Object.entries(localStorage).sort()), session: Object.fromEntries(Object.entries(sessionStorage).sort()), indexed, caches: (await caches.keys()).sort() };
});

const snapshot = async (page: Page, name: string) => {
  const file = `${name}.png`;
  await page.screenshot({ path: resolve(output, file) });
  screenshots.push(file);
};
const focusIs = (page: Page, selector: string) => page.locator(selector).evaluate(element => element === document.activeElement);
const noOverflow = async (page: Page, label: string) => {
  equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${label}: no horizontal page overflow`);
  equal(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.body.scrollHeight <= innerHeight), true, `${label}: no vertical page overflow`);
  const bounds = await page.locator("[data-assistant-screen]").boundingBox();
  check(bounds && bounds.width <= page.viewportSize()!.width, `${label}: shell fits width`);
  const composerFit = await page.getByRole("form", { name: "Message composer" }).evaluate(element => {
    const composer = element.getBoundingClientRect();
    const area = element.parentElement!.getBoundingClientRect();
    return { composerBottom: composer.bottom, areaBottom: area.bottom, viewportBottom: visualViewport?.height ?? innerHeight };
  });
  check(composerFit.composerBottom <= composerFit.viewportBottom - 12, `${label}: rounded composer retains at least 12px viewport breathing room`);
  check(composerFit.areaBottom <= composerFit.viewportBottom - 12, `${label}: composer area and preview notice remain fully above the viewport edge`);
  const controls = await page.locator("#assistant-message, select, button[aria-label='Send'], a").evaluateAll(elements => elements.map(element => { const r = element.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }));
  check(controls.every(Boolean), `${label}: composer and navigation remain visible`);
};

const profiles = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "review-viewport", width: 1440, height: 814 },
  { name: "compact", width: 390, height: 844 },
  { name: "narrow", width: 320, height: 568 },
  { name: "zoom-200-equivalent", width: 720, height: 450 },
  { name: "reduced-motion", width: 1024, height: 768 },
  { name: "forced-colors", width: 1024, height: 768 },
];

try {
  const fixture = await createPhase1LegacyFixtureTransport();
  const seededLocal = [
    { name: "da_welcome_seen", value: "1" }, { name: "da_welcome_never_show", value: "1" },
    { name: "da_saved_unified_projects_v1", value: JSON.stringify({ storageVersion: 1, projects: [fixture.unified] }) },
    { name: "diamond_ai_animator_ledger_v1:phase1-protected", value: JSON.stringify({ version: 1, projectId: "phase1-protected", messages: [], jobs: [] }) },
  ];
  for (const profile of profiles) {
    group = `${profile.name}:setup`;
    const context = await browser.newContext({
      viewport: { width: profile.width, height: profile.height },
      reducedMotion: profile.name === "reduced-motion" ? "reduce" : "no-preference",
      forcedColors: profile.name === "forced-colors" ? "active" : "none",
      storageState: { cookies: [], origins: [{ origin, localStorage: seededLocal }] },
    });
    await configure(context);
    await context.tracing.start({ screenshots: true, snapshots: true });
    const page = await context.newPage();
    await page.goto(origin);
    const card = page.getByRole("button", { name: "AI Assistant Ask questions and get guidance." });
    await card.waitFor();
    // Nonempty recovery asset evidence, with no draft head to alter startup behavior.
    await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolveDb, reject) => {
        const request = indexedDB.open("diamond-animation-project-recovery-v1", 1);
        request.onupgradeneeded = () => {
          for (const name of ["heads", "owners", "candidates", "assets", "assetMetadata"]) request.result.createObjectStore(name);
        };
        request.onsuccess = () => resolveDb(request.result); request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolveTx, reject) => { const tx = db.transaction("assets", "readwrite"); tx.objectStore("assets").put(new Blob(["phase1 recovery asset sentinel"]), "phase1-sentinel"); tx.oncomplete = () => resolveTx(); tx.onerror = () => reject(tx.error); });
      db.close();
    });
    const before = await inventory(page);
    group = `${profile.name}:assistant`;
    const started = performance.now();
    await card.focus();
    await page.keyboard.press("Enter");
    await page.waitForURL(`${origin}/assistant`);
    await page.getByRole("heading", { level: 1 }).waitFor();
    await page.waitForFunction(() => document.activeElement?.textContent?.includes("Back to Home"));
    timings.push({ profile: profile.name, navigationMs: performance.now() - started });
    equal(await page.title(), "Assistant | Diamond Animator", `${profile.name}: dedicated page title`);
    check(await focusIs(page, 'a[href="/#ai-assistant"]'), `${profile.name}: entry focus is Back to Home`);
    const heading = page.getByRole("heading", { level: 1, name: "How can I help you with Diamond Animator today?" });
    equal(await heading.getAttribute("aria-label"), "How can I help you with Diamond Animator today?", `${profile.name}: heading keeps the exact natural sentence as its accessible name`);
    equal(await heading.locator(":scope > span").allTextContents(), ["How can I help you with", "Diamond Animator today?"], `${profile.name}: heading keeps the exact two-line visual composition`);
    if (profile.name === "desktop") {
      const lineBoxes = await heading.locator(":scope > span").evaluateAll(lines => lines.map(line => { const rect = line.getBoundingClientRect(); return { y: rect.y, height: rect.height, lineHeight: Number.parseFloat(getComputedStyle(line).lineHeight) }; }));
      check(lineBoxes.length === 2 && lineBoxes.every(line => line.height <= line.lineHeight + 1) && lineBoxes[1].y > lineBoxes[0].y, "desktop: exact greeting renders as two intentional unwrapped lines");
    }
    equal(await page.locator('section[aria-label="Conversation"] p').count(), 0, `${profile.name}: no eyebrow, slogan, introduction, description or badge`);
    equal(await page.locator('section[aria-label="Conversation"] span').count(), 2, `${profile.name}: conversation has only the two intentional heading-line spans`);
    equal(await page.getByText("Preview", { exact: true }).count(), 0, `${profile.name}: preview badge is absent`);
    equal(await page.locator('path[d="M3 9l4-5h10l4 5-9 11L3 9z"]').count(), 2, `${profile.name}: sidebar and hero use exact Home AppChrome diamond geometry`);
    equal(await page.locator("canvas, [data-animation-workspace], [data-drawing-workspace]").count(), 0, `${profile.name}: no workspace or canvas mounted`);
    check(await page.getByRole("button", { name: /New Chat/ }).isDisabled(), `${profile.name}: New Chat is disabled`);
    check(await page.getByRole("button", { name: /Microphone/ }).isDisabled(), `${profile.name}: microphone is disabled`);
    equal(await page.locator("select option").allTextContents(), ["Low", "Medium", "High", "Extra High"], `${profile.name}: exact reasoning labels`);
    equal(await page.getByRole("combobox").inputValue(), "medium", `${profile.name}: Medium default`);
    await page.keyboard.press("Tab");
    check(await focusIs(page, 'section[aria-label="Conversation"]'), `${profile.name}: keyboard reaches scrollable conversation`);
    await page.keyboard.press("Tab");
    check(await focusIs(page, "#assistant-message"), `${profile.name}: keyboard reaches composer`);
    const draft = page.getByRole("textbox", { name: "Message the Assistant" });
    await page.waitForTimeout(200);
    const focusPresentation = await draft.evaluate(element => {
      const outer = element.closest("form")!;
      const area = outer.parentElement!;
      const hero = document.querySelector('section[aria-label="Conversation"] svg')!.parentElement!;
      const viewportBottom = visualViewport?.height ?? innerHeight;
      return {
        textareaOutline: getComputedStyle(element).outlineStyle,
        composerFocusBorder: getComputedStyle(outer).borderTopColor,
        composerRadius: Number.parseFloat(getComputedStyle(outer).borderTopLeftRadius),
        composerHeight: outer.getBoundingClientRect().height,
        heroOpacity: getComputedStyle(hero).opacity,
        heroBorderWidth: getComputedStyle(hero).borderTopWidth,
        composerBottomGap: viewportBottom - outer.getBoundingClientRect().bottom,
        areaBottomGap: viewportBottom - area.getBoundingClientRect().bottom,
      };
    });
    equal(focusPresentation.textareaOutline, "none", `${profile.name}: textarea has no square inner focus outline`);
    if (profile.name === "forced-colors") check(focusPresentation.composerFocusBorder !== "rgba(0, 0, 0, 0)", `${profile.name}: rounded composer uses the system focus color`);
    else equal(focusPresentation.composerFocusBorder, "rgb(64, 142, 255)", `${profile.name}: rounded composer owns bright-blue focus color`);
    check(focusPresentation.composerRadius >= 14, `${profile.name}: focused composer remains rounded`);
    check(focusPresentation.composerHeight >= 102 && focusPresentation.composerHeight <= 136, `${profile.name}: composer is moderately sized and about 15–20% shorter`);
    equal(focusPresentation.heroOpacity, "0.28", `${profile.name}: hero diamond is subtly translucent`);
    equal(focusPresentation.heroBorderWidth, "0px", `${profile.name}: hero diamond has no card or badge frame`);
    const sidebarBounds = await page.getByRole("complementary", { name: "Chat sessions" }).boundingBox();
    const mainBounds = await page.locator("main").boundingBox();
    check(Boolean(sidebarBounds && mainBounds), `${profile.name}: shell regions have layout bounds`);
    const layout = profile.width > 760 ? "sidebar" : "top-strip";
    if (layout === "sidebar") {
      check(Math.abs(sidebarBounds!.width - 256) < 1 && Math.abs(sidebarBounds!.height - profile.height) < 1, `${profile.name}: desktop session rail is a distinct full-height sidebar`);
      check(Math.abs(mainBounds!.x - sidebarBounds!.width) < 1, `${profile.name}: desktop main begins after sidebar`);
    } else {
      check(Math.abs(sidebarBounds!.width - profile.width) < 1 && sidebarBounds!.height < 130, `${profile.name}: responsive session rail becomes a compact top strip`);
      check(mainBounds!.y >= sidebarBounds!.height - 1, `${profile.name}: responsive main begins below top strip`);
    }
    presentation.push({ profile: profile.name, layout, composerHeight: focusPresentation.composerHeight, heroOpacity: focusPresentation.heroOpacity, textareaOutline: focusPresentation.textareaOutline, composerFocusBorder: focusPresentation.composerFocusBorder, composerBottomGap: focusPresentation.composerBottomGap, areaBottomGap: focusPresentation.areaBottomGap });
    await draft.fill("How do I start?");
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type("A second line.");
    check((await draft.inputValue()).includes("\n"), `${profile.name}: Shift+Enter inserts newline`);
    const draftBeforeSend = await draft.inputValue();
    await page.keyboard.press("Enter");
    await page.getByRole("status").filter({ hasText: "Nothing was sent" }).waitFor();
    equal(await draft.inputValue(), draftBeforeSend, `${profile.name}: Enter preserves draft`);
    await page.keyboard.press("Tab");
    check(await focusIs(page, "select"), `${profile.name}: keyboard reaches reasoning`);
    for (const level of ["low", "medium", "high", "xhigh"]) {
      await page.getByRole("combobox").selectOption(level);
      equal(await page.getByRole("combobox").inputValue(), level, `${profile.name}: selects ${level}`);
    }
    await page.keyboard.press("Tab");
    check(await focusIs(page, "button[aria-label='Send']"), `${profile.name}: disabled microphone skipped and Send reached`);
    await page.keyboard.press("Enter");
    equal(await draft.inputValue(), draftBeforeSend, `${profile.name}: Send remains local and preserves draft`);
    await draft.fill("Long draft " + "word ".repeat(2000));
    check(await draft.evaluate(element => element.scrollHeight > element.clientHeight), `${profile.name}: long draft scrolls inside composer`);
    await noOverflow(page, profile.name);
    await draft.fill("");
    await page.getByRole("combobox").selectOption("medium");
    await snapshot(page, profile.name);
    await page.addScriptTag({ path: resolve("node_modules/axe-core/axe.min.js") });
    const violations = await page.evaluate(async () => {
      const result = await (window as unknown as { axe: { run: (selector: string) => Promise<{ violations: Array<{ id: string; impact: string; nodes: unknown[] }> }> } }).axe.run("[data-assistant-screen]");
      return result.violations.filter(item => item.impact === "serious" || item.impact === "critical");
    });
    accessibility.push({ profile: profile.name, violations });
    equal(violations, [], `${profile.name}: Axe has no serious or critical findings`);
    if (profile.name === "reduced-motion") equal(await page.locator("[data-assistant-screen]").evaluate(element => element.getAnimations({ subtree: true }).length), 0, "reduced motion: no animations");
    const pane = page.getByRole("region", { name: "Conversation" });
    if (profile.height <= 568) {
      const scrollable = await pane.evaluate(element => element.scrollHeight > element.clientHeight);
      check(scrollable, `${profile.name}: conversation scrolls independently at short height`);
      await pane.focus();
      await page.keyboard.press("End");
      await page.waitForFunction(() => { const pane = document.querySelector('section[aria-label="Conversation"]')!; return pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 2; });
      await noOverflow(page, `${profile.name} after scroll`);
      await snapshot(page, `${profile.name}-scrolled`);
    }
    await draft.fill("Unsaved local draft before leaving");
    await page.getByRole("combobox").selectOption("xhigh");
    await page.getByRole("link", { name: "Back to Home" }).click();
    await card.waitFor();
    await page.waitForFunction(() => document.activeElement?.id === "ai-assistant");
    check(await card.evaluate(element => element === document.activeElement), `${profile.name}: Back to Home restores card focus`);
    const after = await inventory(page);
    equal(after, before, `${profile.name}: all project, recovery, Animator, Assistant, local and session storage unchanged`);
    storage.push({ profile: profile.name, before: hash(JSON.stringify(before)), after: hash(JSON.stringify(after)), inventory: before });
    equal(mutations.filter(entry => entry.group === group), [], `${profile.name}: zero storage write or microphone attempts`);
    equal(requests.filter(entry => entry.group === group && entry.disposition === "blocked"), [], `${profile.name}: zero API/provider/search/transcription/external attempts`);
    await card.click();
    await page.waitForURL(`${origin}/assistant`);
    equal(await page.getByRole("combobox").inputValue(), "medium", `${profile.name}: re-entry starts at Medium`);
    equal(await draft.inputValue(), "", `${profile.name}: no draft persistence`);
    await page.reload();
    await page.getByRole("heading", { level: 1 }).waitFor();
    equal(await page.getByRole("combobox").inputValue(), "medium", `${profile.name}: direct reload works`);
    await context.tracing.stop({ path: resolve(output, `${profile.name}-trace.zip`) });
    await context.close();
    console.log(`PASS ${profile.name}`);
  }

  group = "welcome";
  const welcomeContext = await browser.newContext();
  await configure(welcomeContext);
  const welcomePage = await welcomeContext.newPage();
  await welcomePage.goto(origin);
  await welcomePage.getByRole("dialog", { name: "Welcome to Diamond Animator" }).waitFor();
  await welcomePage.waitForFunction(() => getComputedStyle(document.querySelector('[role="dialog"]')!).opacity === "1");
  assertions.push("fresh Home still presents the welcome dialog");
  await welcomePage.keyboard.press("Escape");
  await welcomePage.getByRole("button", { name: /AI Assistant Ask/ }).click();
  await welcomePage.getByRole("link", { name: "Back to Home" }).click();
  await welcomePage.waitForFunction(() => document.activeElement?.id === "ai-assistant");
  await welcomePage.waitForFunction(() => getComputedStyle(document.querySelector('[role="dialog"]')!).opacity === "0");
  equal(await welcomePage.getByRole("dialog", { name: "Welcome to Diamond Animator" }).evaluate(element => getComputedStyle(element).pointerEvents), "none", "return after Escape dismissal does not reopen welcome over restored focus");
  await welcomeContext.close();

  group = "protected";
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: { cookies: [], origins: [{ origin, localStorage: seededLocal }] } });
  await configure(context);
  const page = await context.newPage();
  await page.goto(origin);
  await page.getByRole("button", { name: /AI Assistant Ask/ }).waitFor();
  await page.getByRole("button", { name: /AI Project Finalizer/ }).click();
  equal(await page.locator("[data-assistant-screen], canvas").count(), 0, "AI Project Finalizer stays inert");
  await page.getByRole("button", { name: /Tutorials Learn/ }).click();
  await page.locator("[data-tutorials-screen]").waitFor();
  equal(await page.locator("[data-tutorial-card]").count(), 4, "Tutorials preserves all four cards");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.waitForFunction(() => document.activeElement?.textContent?.includes("Tutorials"));
  assertions.push("Tutorials Back preserves its own focus restoration");
  for (const [name, selector] of [["My Projects", "[data-project-library]"], ["Open Project", "[data-project-library]"], ["Export", "[data-animation-export]"]] as const) {
    await page.getByRole("button", { name: new RegExp(`^${name}`) }).click();
    await page.locator(selector).waitFor();
    equal(await page.locator("[data-assistant-screen], canvas[data-drawing-canvas]").count(), 0, `${name}: preserved separate surface`);
    await snapshot(page, `protected-${name.toLowerCase().replaceAll(" ", "-")}`);
    await page.getByRole("button", { name: /Back/ }).first().click();
    await page.getByRole("button", { name: /AI Assistant Ask/ }).waitFor();
  }
  await page.getByRole("button", { name: /^New Project/ }).click();
  await page.getByRole("button", { name: "File", exact: true }).waitFor();
  await page.getByText("Untitled Project", { exact: true }).first().waitFor();
  check(await page.locator("canvas").count() > 0, "New Project mounts the existing editor canvas");
  equal(await page.locator("[data-assistant-screen]").count(), 0, "New Project does not mount Assistant");
  await snapshot(page, "protected-new-project");
  await context.close();
  equal(errors, [], "no page or console errors across all flows");
  equal(requests.filter(entry => entry.disposition === "blocked"), [], "zero unexpected network attempts across all flows");
  equal(mutations.filter(entry => entry.group.endsWith(":assistant")), [], "zero Assistant storage or microphone attempts across all flows");
  const result = { status: "PASS", assertions, profiles, screenshots, accessibility, timings, presentation, storage, requestLedger: requests, mutationLedger: mutations, errors, browserVersion: browser.version(), externalRequests: 0, assistantApiRequests: 0, providerRequests: 0, searchRequests: 0, transcriptionRequests: 0, paidCalls: 0, estimatedCostUsd: 0 };
  writeFileSync(resolve(output, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ status: result.status, assertions: assertions.length, screenshots: screenshots.length }));
} finally {
  await browser.close();
}
