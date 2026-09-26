import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
import { sealSession, type Session } from "../../src/lib/assistant/assistantContracts.ts";

const base = process.env.SPEC0015_BASE_URL ?? "http://127.0.0.1:58525";
const out = "output/spec0015/phase1";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
let assertions = 0;
const check = (condition: unknown, name: string) => { assert.ok(condition, name); assertions++; };
const attemptedExternal: string[] = [];
const pageErrors: string[] = [];
const consoleErrors: string[] = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(base).origin) { attemptedExternal.push(url.origin); void route.abort(); return; }
    void route.continue();
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Close welcome" }).click();
  await page.getByRole("link", { name: "Open AI dashboard" }).click();
  check(new URL(page.url()).pathname === "/credits", "ordinary Home to Dashboard navigation");
  await page.getByRole("button", { name: "Refresh" }).waitFor({ state: "visible" });
  await page.getByText("No recorded conversation usage in this view.").waitFor();
  check(await page.locator("[data-testid='usage-bar']").count() === 0, "empty browser has no chart bars");
  check(await page.getByRole("checkbox", { name: /Demo/i }).count() === 0, "no public Demo control");
  check(await page.getByText(/Synthetic data/i).count() === 0, "no synthetic mode/banner in public Dashboard");
  check(await page.getByRole("link", { name: "Back to Home" }).count() === 0, "Dashboard-only Home link removed");
  check(await page.getByRole("button", { name: /Download/i }).count() === 0 &&
    await page.getByRole("link", { name: /Download/i }).count() === 0, "Dashboard has no Download control to change");
  check(await page.getByText("No paid plan connected").isVisible(), "paid plan remains unconfigured");
  check(await page.getByRole("button", { name: /^(Previous|Next|Now)$/ }).count() === 0, "no time navigation");
  await page.getByRole("link", { name: "Return to main screen" }).click();
  await page.waitForURL(base + "/");
  check(new URL(page.url()).pathname === "/", "normal header Home navigation preserved");
  await page.getByRole("link", { name: "Open AI dashboard" }).click();
  await page.getByRole("button", { name: "Refresh" }).waitFor({ state: "visible" });
  const localBefore = await page.evaluate(() => Object.keys(localStorage).sort());

  // The synthetic fixture is injected only in this isolated browser proof context.
  const fixture = JSON.parse(readFileSync("scripts/fixtures/spec0015-dashboard/phase1.json", "utf8")) as {
    frozenNow: string; receipts: { source: string; at: string; tokens: number }[];
  };
  const frozenNow = Date.parse(fixture.frozenNow);
  const fixtureContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce", hasTouch: true });
  await fixtureContext.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(base).origin) { attemptedExternal.push(url.origin); void route.abort(); return; }
    void route.continue();
  });
  await fixtureContext.addInitScript({ content: `Date.now = () => ${frozenNow};` });
  const fixturePage = await fixtureContext.newPage();
  fixturePage.on("pageerror", (error) => pageErrors.push(error.message));
  fixturePage.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await fixturePage.goto(`${base}/credits`, { waitUntil: "domcontentloaded" });
  await fixturePage.getByRole("button", { name: "Refresh" }).waitFor({ state: "visible" });
  await fixturePage.evaluate((rows) => {
    const projectId = "spec15fixture";
    const jobs = rows.map((row: { at: string; tokens: number }, index: number) => {
      const iso = row.at.replace("Z", ".000Z");
      return {
        version: 1, jobId: `spec15fixturejob${index}`, turnId: `spec15fixtureturn${index}`, projectId, projectGeneration: 1,
        reasoningLevel: "medium", intent: "conversation", status: "done", lastSequence: 2,
        createdAt: iso, updatedAt: iso, completedAt: iso,
        telemetry: { model: "gpt-5.6-terra", effort: "medium", outcome: "succeeded", latencyMs: 800,
          promptDigest: "0".repeat(64), usage: { inputTokens: row.tokens, outputTokens: 0, totalTokens: row.tokens, estimatedCostUsd: null } },
        events: [{ sequence: 1, status: "thinking", createdAt: iso }, { sequence: 2, status: "done", createdAt: iso }],
      };
    });
    localStorage.setItem(`diamond_ai_animator_ledger_v1:${projectId}`, JSON.stringify({
      version: 1, projectId, messages: [], updatedAt: rows.at(-1)!.at, jobs,
    }));
  }, fixture.receipts);
  await fixturePage.getByRole("button", { name: "Refresh" }).click();
  const fixtureBars = fixturePage.locator("[data-testid='usage-bar']");
  await fixtureBars.first().waitFor();
  check(await fixtureBars.count() === 16, "one bar per actual quarter-hour activity interval, no idle tail");
  const values = await fixtureBars.evaluateAll((nodes) => nodes.map((node) => ({
    start: Number((node as HTMLElement).dataset.start), spent: Number((node as HTMLElement).dataset.intervalTokens),
    selected: Number((node as HTMLElement).dataset.selectedTokens), combined: Number((node as HTMLElement).dataset.combinedTokens),
    color: (node as HTMLElement).dataset.color,
  })));
  check(values[0].start === Date.parse("2026-09-20T18:45:00Z") && values.at(-1)?.start === Date.parse("2026-09-21T00:00:00Z"),
    "bars begin with first activity and end with last activity");
  check(values.every((value, index) => index === 0 || value.start > values[index - 1].start), "bars in chronological order");
  check(values.at(-1)?.spent === 100 && values.at(-1)?.selected === 100, "same-interval receipts aggregate in one reset bar");
  check(values.at(-2)?.selected === 10000 && values.at(-2)?.color === "#ff0000" && values.at(-1)?.color?.startsWith("#2"),
    "red exhaustion before Monday reset, small blue first bar after");
  const geometry = await fixturePage.locator("[aria-label='Combined weekly test preview chart']").evaluate((chart) => {
    const plot = chart.querySelector("[class*='plotWrap']")!.getBoundingClientRect();
    const rendered = [...chart.querySelectorAll("[data-testid='usage-bar']")].map((bar) => bar.getBoundingClientRect());
    return { plotHeight: plot.height, leftInset: rendered[0].left - plot.left, gap: rendered[1].left - rendered[0].right,
      unusedRight: plot.right - rendered.at(-1)!.right, floorError: Math.max(...rendered.filter((bar) => bar.height > 0)
        .map((bar) => Math.abs(bar.bottom - (plot.bottom - 2)))) };
  });
  check(Math.abs(geometry.plotHeight - 220) <= 2 && Math.abs(geometry.gap - 7) <= 1 && geometry.leftInset <= 10,
    "220px chart with existing gap and first bar at left edge");
  check(geometry.unusedRight > 100 && geometry.floorError <= 3, "unused capacity remains empty to right; bars floor-anchored");
  const fixtureButtons = fixturePage.locator("[aria-label='Combined weekly test preview chart'] button");
  const tooltip = fixturePage.locator("[data-testid='usage-tooltip']");
  const plotBox = (await fixturePage.locator("[class*='plotWrap']").boundingBox())!;
  const firstBox = (await fixtureBars.first().boundingBox())!;
  await fixturePage.mouse.move(firstBox.x + firstBox.width / 2, plotBox.y + 25);
  check(await tooltip.count() === 0 && await fixtureBars.first().getAttribute("data-active") === null &&
    await fixtureButtons.first().evaluate((button) => getComputedStyle(button).cursor) === "default",
    "empty slot above the short bar has no tooltip, white outline, or pointer cursor");
  await fixtureBars.first().hover();
  check(await tooltip.count() === 1 && (await tooltip.innerText()).includes("Spent: 1,000 recorded tokens") &&
    !(await tooltip.innerText()).includes("Since last bar"), "hovering first colored bar shows compact facts without comparison");
  check(await fixtureBars.first().getAttribute("data-active") === "true" &&
    await fixtureBars.first().evaluate((bar) => getComputedStyle(bar).outlineColor) === "rgb(255, 255, 255)" &&
    await fixtureBars.first().evaluate((bar) => getComputedStyle(bar).cursor) === "pointer",
    "white outline and pointer cursor apply to actual colored bar");
  check((await fixtureButtons.first().getAttribute("title")) === null &&
    (await fixtureButtons.first().getAttribute("aria-label"))!.includes("local ") &&
    (await fixtureButtons.first().getAttribute("aria-label"))!.includes("UTC ") &&
    !(await fixtureButtons.first().getAttribute("aria-label"))!.includes("interval spend change"),
    "no native title duplicate; accessible name has local/UTC facts and omits first-bar comparison");
  const popupGeometry = async (barIndex: number) => fixturePage.evaluate((index) => {
    const plot = document.querySelector("[class*='plotWrap']")!.getBoundingClientRect();
    const popup = document.querySelector("[data-testid='usage-tooltip']")!.getBoundingClientRect();
    const bar = document.querySelectorAll("[data-testid='usage-bar']")[index].getBoundingClientRect();
    return { inside: popup.left >= plot.left && popup.right <= plot.right && popup.top >= plot.top && popup.bottom <= plot.bottom,
      avoidsBar: popup.right <= bar.left || popup.left >= bar.right || popup.bottom <= bar.top || popup.top >= bar.bottom };
  }, barIndex);
  check((await popupGeometry(0)).inside && (await popupGeometry(0)).avoidsBar, "leftmost popup stays inside plot and beside bar");
  await fixturePage.locator("section[aria-labelledby='usage-heading']").screenshot({ path: `${out}/desktop-hover-first.png` });
  await fixturePage.mouse.move(plotBox.x + plotBox.width - 15, plotBox.y + 35);
  check(await tooltip.count() === 0 && await fixtureBars.first().getAttribute("data-active") === null,
    "pointer leave immediately clears popup and outline");
  check(values[4].spent === 1000 && values[5].spent === 500, "decrease probe has adjacent plotted interval spends");
  await fixtureBars.nth(5).hover();
  check((await tooltip.innerText()).includes("Spent: 500 recorded tokens") &&
    (await tooltip.innerText()).includes("Since last bar: -500 tokens") &&
    (await fixtureButtons.nth(5).getAttribute("aria-label"))!.includes("interval spend change since last plotted bar -500 tokens"),
    "hover and accessible name show lower interval spend as a negative change");
  await fixturePage.locator("section[aria-labelledby='usage-heading']").screenshot({ path: `${out}/desktop-hover-decrease.png` });
  await fixtureBars.last().hover();
  check((await tooltip.innerText()).includes("This UTC week: 100 (1.0%)") &&
    !(await tooltip.innerText()).includes("Since last bar") &&
    (await tooltip.innerText()).includes("UTC week reset"), "first post-reset hover shows small blue cumulative fact without cross-week comparison");
  check(!(await fixtureButtons.last().getAttribute("aria-label"))!.includes("interval spend change"),
    "post-reset accessible name omits cross-week comparison");
  check((await popupGeometry(15)).inside && (await popupGeometry(15)).avoidsBar, "rightmost active popup stays inside plot and beside bar");
  await fixturePage.locator("section[aria-labelledby='usage-heading']").screenshot({ path: `${out}/desktop-hover-reset.png` });
  await fixtureBars.first().click();
  await fixturePage.mouse.move(plotBox.x + plotBox.width - 15, plotBox.y + 35);
  check(await tooltip.count() === 0 && await fixtureBars.first().getAttribute("data-active") === null &&
    await fixturePage.locator("[class*='bucketDetail']").count() === 0,
    "desktop click leaves no pinned tooltip or below-chart detail panel");
  await fixtureButtons.nth(1).focus();
  await fixturePage.keyboard.press("Enter");
  check((await tooltip.innerText()).includes("Spent: 1,000 recorded tokens") &&
    (await tooltip.innerText()).includes("Since last bar: 0 tokens") &&
    (await fixtureButtons.nth(1).getAttribute("aria-label"))!.includes("interval spend change since last plotted bar 0 tokens"),
    "keyboard focus and accessible name show zero change for equal interval spends");
  await fixturePage.getByRole("button", { name: "Refresh" }).focus();
  check(await tooltip.count() === 0, "keyboard blur clears focus tooltip");
  const setSecondSpend = async (tokens: number) => fixturePage.evaluate((value) => {
    const key = "diamond_ai_animator_ledger_v1:spec15fixture";
    const ledger = JSON.parse(localStorage.getItem(key)!);
    ledger.jobs[1].telemetry.usage.inputTokens = value;
    ledger.jobs[1].telemetry.usage.totalTokens = value;
    localStorage.setItem(key, JSON.stringify(ledger));
  }, tokens);
  await setSecondSpend(2454);
  await fixturePage.getByRole("button", { name: "Refresh" }).click();
  await fixturePage.waitForFunction(() => document.querySelectorAll("[data-testid='usage-bar']")[1]?.getAttribute("data-interval-tokens") === "2454");
  await fixtureBars.nth(1).hover();
  check((await tooltip.innerText()).includes("Spent: 2,454 recorded tokens") &&
    (await tooltip.innerText()).includes("Since last bar: +1,454 tokens") &&
    (await fixtureButtons.nth(1).getAttribute("aria-label"))!.includes("interval spend change since last plotted bar +1,454 tokens"),
    "hover and accessible name compare 2,454 interval tokens against preceding 1,000, not the cumulative delta");
  await fixturePage.locator("section[aria-labelledby='usage-heading']").screenshot({ path: `${out}/desktop-hover-increase.png` });
  await setSecondSpend(1000);
  await fixturePage.getByRole("button", { name: "Refresh" }).click();
  await fixturePage.waitForFunction(() => document.querySelectorAll("[data-testid='usage-bar']")[1]?.getAttribute("data-interval-tokens") === "1000");
  check((await fixtureBars.nth(1).getAttribute("data-selected-tokens")) === "2000", "comparison-only proof restores the fixture before other checks");
  await fixturePage.locator("section[aria-labelledby='usage-heading']").screenshot({ path: `${out}/desktop-chart.png` });
  await fixturePage.locator("main").screenshot({ path: `${out}/desktop-dashboard.png` });
  await fixturePage.getByRole("button", { name: "Project AI", exact: true }).click();
  check(await fixtureBars.count() === 16, "Project filter shows only fixture Project activity");
  await fixturePage.locator("section[aria-labelledby='usage-heading']").screenshot({ path: `${out}/desktop-project-chart.png` });
  await fixturePage.getByRole("button", { name: "Assistant", exact: true }).click();
  check(await fixtureBars.count() === 0, "unrelated Project activity creates no Assistant bars");
  check(await fixturePage.locator("[aria-labelledby='weekly-heading']").getByText("100", { exact: true }).isVisible(),
    "pinned Combined progress remains on Assistant filter");
  await fixturePage.locator("section[aria-labelledby='usage-heading']").screenshot({ path: `${out}/desktop-assistant-chart.png` });
  await fixturePage.getByRole("button", { name: "Combined", exact: true }).click();
  for (const [name, count] of [["1 min", 1], ["15 min", 16], ["Hour", 7], ["Day", 2], ["Week", 2]] as const) {
    await fixturePage.getByRole("button", { name, exact: true }).click();
    check(await fixtureBars.count() === count, `${name} plots activity intervals only`);
  }
  await fixturePage.getByRole("button", { name: "15 min", exact: true }).click();
  check(await fixturePage.getByText("Accessible interval details").count() === 0 &&
    await fixturePage.locator("[class*='bucketDetail']").count() === 0, "clean under-chart area has no per-bar panel or disclosure");
  await fixturePage.evaluate((at) => { Date.now = () => at + 60_000; }, frozenNow);
  await fixturePage.getByRole("button", { name: "Refresh" }).click();
  check(await fixtureBars.count() === 16, "idle clock minute adds no bar");
  await fixturePage.evaluate((at) => { Date.now = () => at + 16 * 60_000; }, frozenNow);
  await fixturePage.getByRole("button", { name: "Refresh" }).click();
  await fixturePage.waitForFunction(() => document.querySelectorAll("[data-testid='usage-bar']").length === 15);
  check(await fixtureBars.count() === 15 && (await fixtureBars.last().getAttribute("data-start")) === String(Date.parse("2026-09-21T00:00:00Z")),
    "crossing idle interval adds no new tail; oldest interval ages from window");
  await fixturePage.setViewportSize({ width: 360, height: 800 });
  const mobile = await fixturePage.evaluate(() => ({ viewport: innerWidth, main: document.querySelector("main")!.scrollWidth }));
  check(mobile.main <= mobile.viewport, "mobile Dashboard has no horizontal overflow");
  await fixtureBars.last().tap();
  check(await tooltip.count() === 1 && (await tooltip.innerText()).includes("This UTC week: 100 (1.0%)"),
    "touch tap toggles the same compact tooltip");
  check((await popupGeometry((await fixtureBars.count()) - 1)).inside, "touch tooltip stays inside compact plot");
  await fixturePage.locator("section[aria-labelledby='usage-heading']").screenshot({ path: `${out}/mobile-tap-tooltip.png` });
  await fixtureBars.last().tap();
  check(await tooltip.count() === 0, "second touch tap hides tooltip");
  await fixturePage.locator("section[aria-labelledby='usage-heading']").screenshot({ path: `${out}/mobile-chart.png` });
  await fixturePage.locator("main").screenshot({ path: `${out}/mobile-dashboard.png` });
  await fixturePage.setViewportSize({ width: 320, height: 800 });
  check(await fixturePage.evaluate(() => document.querySelector("main")!.scrollWidth <= innerWidth), "320px reflow");
  await fixturePage.locator("main").screenshot({ path: `${out}/mobile-320-dashboard.png` });
  await fixturePage.setViewportSize({ width: 768, height: 900 });
  await fixturePage.locator("main").screenshot({ path: `${out}/tablet-dashboard.png` });
  await fixturePage.setViewportSize({ width: 1440, height: 900 });
  const zoom = await fixturePage.evaluate(() => {
    document.documentElement.style.zoom = "200%";
    const main = document.querySelector("main")!;
    return { viewport: innerWidth, mainWidth: main.getBoundingClientRect().width, mainScrollWidth: main.scrollWidth, mainClientWidth: main.clientWidth };
  });
  check(zoom.mainWidth <= zoom.viewport + 1 && zoom.mainScrollWidth <= zoom.mainClientWidth + 1, "200-percent zoom reflow");
  await fixtureBars.last().hover();
  check(await tooltip.count() === 1 && (await popupGeometry((await fixtureBars.count()) - 1)).inside,
    "hover tooltip stays inside plot at 200-percent zoom");
  await fixturePage.screenshot({ path: `${out}/zoom-200-hover.png` });
  await fixturePage.mouse.move(0, 0);
  check(await tooltip.count() === 0, "zoom hover clears on leave");
  await fixturePage.locator("main").screenshot({ path: `${out}/zoom-200-dashboard.png` });
  await fixturePage.evaluate((at) => { document.documentElement.style.zoom = ""; Date.now = () => at; }, frozenNow);
  await fixturePage.evaluate((times) => {
    const key = "diamond_ai_animator_ledger_v1:spec15fixture";
    const ledger = JSON.parse(localStorage.getItem(key)!);
    times.forEach((at: string, index: number) => {
      const iso = at.replace("Z", ".000Z");
      const job = structuredClone(ledger.jobs[0]);
      job.jobId = `spec15edgejob${index}`; job.turnId = `spec15edgeturn${index}`;
      job.createdAt = iso; job.updatedAt = iso; job.completedAt = iso;
      job.telemetry.usage = { inputTokens: 10, outputTokens: 0, totalTokens: 10, estimatedCostUsd: null };
      job.events = [{ sequence: 1, status: "thinking", createdAt: iso }, { sequence: 2, status: "done", createdAt: iso }];
      ledger.jobs.push(job);
    });
    ledger.updatedAt = times.at(-1);
    localStorage.setItem(key, JSON.stringify(ledger));
  }, ["2026-09-20T19:00:00Z", "2026-09-20T21:45:00Z", "2026-09-20T22:15:00Z", "2026-09-20T22:45:00Z",
    "2026-09-20T23:15:00Z", "2026-09-20T23:30:00Z", "2026-09-21T00:15:00Z", "2026-09-21T00:30:00Z"]);
  await fixturePage.getByRole("button", { name: "Refresh" }).click();
  await fixturePage.waitForFunction(() => document.querySelectorAll("[data-testid='usage-bar']").length === 24);
  await fixtureBars.last().hover();
  const rightEdge = await fixturePage.evaluate(() => {
    const popup = document.querySelector("[data-testid='usage-tooltip']")!.getBoundingClientRect();
    const bar = [...document.querySelectorAll("[data-testid='usage-bar']")].at(-1)!.getBoundingClientRect();
    return { popupRight: popup.right, barLeft: bar.left };
  });
  check((await popupGeometry(23)).inside && (await popupGeometry(23)).avoidsBar && rightEdge.popupRight < rightEdge.barLeft,
    "far-right active bar places the tooltip to its left inside the chart");
  await fixturePage.screenshot({ path: `${out}/desktop-hover-right-edge.png` });
  await fixtureContext.close();
  check(JSON.stringify(localBefore) === JSON.stringify(await page.evaluate(() => Object.keys(localStorage).sort())),
    "isolated fixture never writes ordinary browser history");
  await page.setViewportSize({ width: 360, height: 800 });
  const bars = page.locator("[data-testid='usage-bar']");
  // Both existing storage formats are populated with synthetic, valid receipts. No provider route is called.
  const now = Date.now();
  const sessionBase: Session = {
    schema: "diamond-assistant-session/v1", id: "spec15session", title: "Synthetic chat", titleSource: "automatic", manualTitleRevision: 0,
    createdAt: now - 3000, updatedAt: now, reasoning: "medium", revision: 1, digest: "",
    messages: [
      { id: "spec15user01", turnId: "spec15turn01", role: "user", text: "Synthetic question", at: now - 3000 },
      { id: "spec15reply1", turnId: "spec15turn01", role: "assistant", text: "Synthetic answer", at: now - 1000 },
    ],
    turns: [{ id: "spec15turn01", jobId: "spec15job001", status: "done", reasoning: "medium", at: now - 3000,
      acceptedAt: now - 2500, endedAt: now - 1000, contextIds: [], error: null,
      usage: { inputTokens: 30, outputTokens: 20, totalTokens: 50, estimatedCostUsd: .0003, priceDate: "2026-09-22", responseId: "spec15resp01", latencyMs: 1000, model: "gpt-5.6-terra", reasoning: "medium", toolCalls: 0 } }],
  };
  const session = await sealSession(sessionBase);
  await page.evaluate(async ({ savedSession, at }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("diamond-assistant-session-v1", 1);
      request.onupgradeneeded = () => { request.result.createObjectStore("sessions", { keyPath: "id" }); request.result.createObjectStore("leases"); };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("sessions", "readwrite"); tx.objectStore("sessions").put(savedSession);
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
    db.close();
    const iso = new Date(at - 20 * 60_000).toISOString();
    localStorage.setItem("diamond_ai_animator_ledger_v1:spec15proj", JSON.stringify({
      version: 1, projectId: "spec15proj", messages: [], updatedAt: iso,
      jobs: [{ version: 1, jobId: "spec15job002", turnId: "spec15turn02", projectId: "spec15proj", projectGeneration: 1,
        reasoningLevel: "medium", intent: "conversation", status: "done", lastSequence: 2,
        createdAt: iso, updatedAt: iso, completedAt: iso,
        telemetry: { model: "gpt-5.6-terra", effort: "medium", outcome: "succeeded", latencyMs: 800,
          promptDigest: "0".repeat(64), usage: { inputTokens: 70, outputTokens: 30, totalTokens: 100, estimatedCostUsd: .0005 } },
        events: [{ sequence: 1, status: "thinking", createdAt: iso }, { sequence: 2, status: "done", createdAt: iso }] }],
    }));
  }, { savedSession: session, at: now });
  await page.getByRole("button", { name: "Refresh" }).click();
  await page.locator("[aria-labelledby='weekly-heading']").getByText("150", { exact: true }).waitFor();
  check((await bars.last().getAttribute("data-selected-tokens")) === "150", "readable real Terra plus Assistant receipts combine");
  check(await bars.count() === 2, "real Project and Assistant receipts in separate intervals create exactly two bars");
  await page.getByRole("button", { name: "Project AI", exact: true }).click();
  check((await bars.last().getAttribute("data-selected-tokens")) === "100" && await bars.count() === 1,
    "newer unrelated Assistant chat creates no Project tail bar");
  await page.getByRole("button", { name: "Assistant", exact: true }).click();
  check((await bars.last().getAttribute("data-selected-tokens")) === "50" && await bars.count() === 1,
    "real Assistant receipt read as its own active interval");
  await page.locator("main").screenshot({ path: `${out}/mobile-real-receipts.png` });

  await page.getByRole("button", { name: "Combined", exact: true }).click();
  await page.evaluate(() => localStorage.setItem("diamond_ai_animator_ledger_v1:broken", "{broken"));
  await page.getByRole("button", { name: "Refresh" }).click();
  await page.getByText("Partial data — combined percentage unavailable").waitFor();
  check((await bars.last().getAttribute("data-selected-tokens")) === "150", "readable receipts remain inspectable under partial coverage");
  await bars.last().hover();
  check((await page.locator("[data-testid='usage-tooltip']").innerText()).includes("Partial records; totals may be low"),
    "partial-source hover keeps a compact undercount caveat");
  await page.mouse.move(0, 0);
  check(await page.evaluate(() => localStorage.getItem("diamond_ai_animator_ledger_v1:broken")) === "{broken", "corrupt source bytes untouched");
  check(await page.locator("[aria-labelledby='weekly-heading']").getByText("150", { exact: true }).count() === 0, "partial coverage does not assert complete combined total");
  await page.locator("main").screenshot({ path: `${out}/mobile-partial.png` });
  await page.evaluate(() => localStorage.removeItem("diamond_ai_animator_ledger_v1:broken"));
  await page.getByRole("button", { name: "Refresh" }).click();
  await page.locator("[aria-labelledby='weekly-heading']").getByText("150", { exact: true }).waitFor();

  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("diamond-assistant-session-v1", 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("sessions", "readwrite"); tx.objectStore("sessions").put({ id: "broken", schema: "invalid" });
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.getByRole("button", { name: "Refresh" }).click();
  await page.getByText("Partial data — combined percentage unavailable").waitFor();
  check((await bars.last().getAttribute("data-selected-tokens")) === "150", "corrupt Assistant row does not destroy valid receipts");
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("diamond-assistant-session-v1", 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("sessions", "readwrite"); tx.objectStore("sessions").delete("broken");
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.getByRole("button", { name: "Refresh" }).click();
  await page.locator("[aria-labelledby='weekly-heading']").getByText("150", { exact: true }).waitFor();

  // A bounded retained corpus measures the local adapter after assets are cached.
  await page.evaluate(() => {
    const original = JSON.parse(localStorage.getItem("diamond_ai_animator_ledger_v1:spec15proj")!);
    for (let index = 0; index < 100; index++) {
      const projectId = `spec15perf${index}`;
      const job = structuredClone(original.jobs[0]);
      job.projectId = projectId; job.jobId = `spec15perfjob${index}`; job.turnId = `spec15perfturn${index}`;
      job.telemetry.usage = { inputTokens: 1, outputTokens: 0, totalTokens: 1, estimatedCostUsd: null };
      localStorage.setItem(`diamond_ai_animator_ledger_v1:${projectId}`, JSON.stringify({ version: 1, projectId, messages: [], jobs: [job], updatedAt: original.updatedAt }));
    }
  });
  const refreshStarted = Date.now();
  await page.getByRole("button", { name: "Refresh" }).click();
  await page.locator("[aria-labelledby='weekly-heading']").getByText("250", { exact: true }).waitFor();
  const refreshMs = Date.now() - refreshStarted;
  check(refreshMs < 2000, "101-ledger corpus settles within two seconds after cached assets");
  const filterStarted = Date.now();
  await page.getByRole("button", { name: "Project AI", exact: true }).click();
  check((await bars.last().getAttribute("data-selected-tokens")) === "200", "large corpus Project contribution");
  const filterMs = Date.now() - filterStarted;
  check(filterMs < 200, "source filter responds within 200ms");
  await page.evaluate(() => { for (let index = 0; index < 100; index++) localStorage.removeItem(`diamond_ai_animator_ledger_v1:spec15perf${index}`); });
  await page.getByRole("button", { name: "Refresh" }).click();
  await page.locator("[aria-labelledby='weekly-heading']").getByText("150", { exact: true }).waitFor();
  check((await bars.last().getAttribute("data-selected-tokens")) === "100", "evicted Project records disappear after reread");

  const originalProject = await page.evaluate(() => localStorage.getItem("diamond_ai_animator_ledger_v1:spec15proj")!);
  await page.evaluate(() => {
    const key = "diamond_ai_animator_ledger_v1:spec15proj";
    const ledger = JSON.parse(localStorage.getItem(key)!);
    ledger.jobs.push(structuredClone(ledger.jobs[0]));
    localStorage.setItem(key, JSON.stringify(ledger));
  });
  await page.getByRole("button", { name: "Refresh" }).click();
  await page.locator("[aria-labelledby='weekly-heading']").getByText("150", { exact: true }).waitFor();
  check((await bars.last().getAttribute("data-selected-tokens")) === "100", "identical retained duplicate is counted once");
  await page.evaluate(() => {
    const key = "diamond_ai_animator_ledger_v1:spec15proj";
    const ledger = JSON.parse(localStorage.getItem(key)!);
    ledger.jobs[1].telemetry.usage.estimatedCostUsd = .009;
    localStorage.setItem(key, JSON.stringify(ledger));
  });
  await page.getByRole("button", { name: "Refresh" }).click();
  await page.getByText("Partial data — combined percentage unavailable").waitFor();
  check(await bars.count() === 0, "conflicting duplicate Project receipt excluded without a zero-height bar");
  await page.evaluate((raw) => localStorage.setItem("diamond_ai_animator_ledger_v1:spec15proj", raw), originalProject);
  await page.getByRole("button", { name: "Refresh" }).click();
  await page.locator("[aria-labelledby='weekly-heading']").getByText("150", { exact: true }).waitFor();

  await page.evaluate(() => {
    const key = "diamond_ai_animator_ledger_v1:spec15proj";
    const ledger = JSON.parse(localStorage.getItem(key)!);
    ledger.jobs[0].telemetry.usage = { inputTokens: null, outputTokens: null, totalTokens: null, estimatedCostUsd: null };
    localStorage.setItem(key, JSON.stringify(ledger));
  });
  await page.getByRole("button", { name: "Refresh" }).click();
  await page.getByText("Partial data — combined percentage unavailable").waitFor();
  check(await bars.count() === 0, "unknown Project usage creates no falsely known zero bar");
  await page.evaluate((raw) => localStorage.setItem("diamond_ai_animator_ledger_v1:spec15proj", raw), originalProject);
  await page.getByRole("button", { name: "Refresh" }).click();
  await page.locator("[aria-labelledby='weekly-heading']").getByText("150", { exact: true }).waitFor();

  await page.evaluate(() => {
    const key = "diamond_ai_animator_ledger_v1:spec15proj";
    const ledger = JSON.parse(localStorage.getItem(key)!);
    ledger.jobs[0].completedAt = new Date(Date.now() + 86_400_000).toISOString();
    localStorage.setItem(key, JSON.stringify(ledger));
  });
  await page.getByRole("button", { name: "Refresh" }).click();
  await page.getByText("Partial data — combined percentage unavailable").waitFor();
  check(await bars.count() === 0, "future Project completion creates no current bar");
  await page.evaluate((raw) => localStorage.setItem("diamond_ai_animator_ledger_v1:spec15proj", raw), originalProject);
  await page.getByRole("button", { name: "Refresh" }).click();
  await page.locator("[aria-labelledby='weekly-heading']").getByText("150", { exact: true }).waitFor();

  await page.evaluate(() => {
    const key = "diamond_ai_animator_ledger_v1:spec15proj";
    const ledger = JSON.parse(localStorage.getItem(key)!);
    ledger.jobs[0].completedAt = "2026-02-30T00:00:00Z";
    localStorage.setItem(key, JSON.stringify(ledger));
  });
  await page.getByRole("button", { name: "Refresh" }).click();
  await page.getByText("Partial data — combined percentage unavailable").waitFor();
  check(await bars.count() === 0, "invalid calendar date creates no normalized-month bar");
  await page.evaluate((raw) => localStorage.setItem("diamond_ai_animator_ledger_v1:spec15proj", raw), originalProject);
  await page.getByRole("button", { name: "Refresh" }).click();
  await page.locator("[aria-labelledby='weekly-heading']").getByText("150", { exact: true }).waitFor();

  await page.evaluate(async () => {
    localStorage.removeItem("diamond_ai_animator_ledger_v1:spec15proj");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("diamond-assistant-session-v1", 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("sessions", "readwrite"); tx.objectStore("sessions").delete("spec15session");
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.getByRole("button", { name: "Refresh" }).click();
  await page.getByText("No recorded conversation usage in this view.").waitFor();
  check(await bars.count() === 0, "deleted source history leaves no Dashboard bar");

  check(attemptedExternal.length === 0, "zero external/provider/payment requests");
  check(pageErrors.length === 0 && consoleErrors.length === 0, "zero page/console errors");
  writeFileSync(`${out}/browser.json`, JSON.stringify({ pass: true, assertions, attemptedExternal, pageErrors, consoleErrors, mobile, zoom, geometry,
    activeIntervals: { fixtureReceipts: fixture.receipts.length, quarter: 16, minute: 1, hour: 7, day: 2, week: 2,
      resetStart: values.at(-1)?.start, noPublicDemo: true, noDashboardDownload: true },
    presentation: { hoverOnVisibleBarOnly: true, whiteBarOutline: true, popupInsidePlot: true, mouseLeaveClears: true,
      desktopClickDoesNotPin: true, keyboardNamesAndFocus: true, touchToggle: true, noUnderChartDetail: true,
      mobileAndZoom: true, intervalSpendComparison: true },
    base, syntheticRealReceipts: 2,
    performance: { terraLedgers: 101, assistantSessions: 1, refreshMs, filterMs },
    partial: { corruptProject: true, corruptAssistant: true, sourceBytesPreserved: true, conflictingDuplicate: true, unknownUsage: true, futureTime: true, invalidCalendarDate: true },
    deletionRestoresEmpty: true }, null, 2));
  console.log(`SPEC-0015 Phase 1 browser PASS (${assertions} assertions)`);
  await context.close();
} finally { await browser.close(); }
