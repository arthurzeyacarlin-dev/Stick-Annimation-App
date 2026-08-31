import assert from "node:assert/strict";
import {spawn, type ChildProcess} from "node:child_process";
import {existsSync, mkdirSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {chromium, type Browser, type BrowserContext, type Page, type Route} from "playwright-core";
import {
  SPEC0003_OUTPUT_DIR,
  assertBrowserPlan,
  readBrowserPlan,
} from "./spec0003-tutorials/browserProofContract.ts";

const ROOT = process.cwd();
const OUTPUT = resolve(ROOT, SPEC0003_OUTPUT_DIR);
const SCREENSHOTS = resolve(OUTPUT, "screenshots");
const PORT = 3184;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

type CardFact = {
  text: string;
  tag: string;
  featured: boolean;
  width: number;
  height: number;
  top: number;
  left: number;
  borderWidth: number;
  paddingTop: number;
  titleSize: number;
  role: string | null;
  tabIndex: string | null;
  cursor: string;
};

const waitForServer = async () => {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(ORIGIN);
      if (response.ok) return;
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  }
  throw new Error("SPEC0003_SERVER_READINESS_TIMEOUT");
};

const stopServer = async (server: ChildProcess | null) => {
  if (!server || server.exitCode !== null) return;
  server.kill("SIGTERM");
  await new Promise<void>((resolveWait) => {
    const timeout = setTimeout(() => {
      if (server.exitCode === null) server.kill("SIGKILL");
      resolveWait();
    }, 5_000);
    server.once("exit", () => {
      clearTimeout(timeout);
      resolveWait();
    });
  });
};

const routeLoopbackOnly = async (route: Route, network: Array<{url: string; method: string; kind: string}>) => {
  const request = route.request();
  const url = new URL(request.url());
  const record = {url: request.url(), method: request.method(), kind: "loopback"};
  if (url.hostname !== "127.0.0.1" || url.port !== String(PORT)) {
    record.kind = "denied-external";
    network.push(record);
    await route.abort("blockedbyclient");
    return;
  }
  if (url.pathname === "/api/ai") {
    network.push({...record, kind: "test-owned-stick-availability"});
    assert.equal(request.method(), "GET");
    assert.equal(request.headers()["x-diamond-ai-workspace"], "stick-figure");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: {"cache-control": "no-store"},
      body: JSON.stringify({available: false, reason: "server_not_configured"}),
    });
    return;
  }
  network.push(record);
  await route.continue();
};

const readCards = async (page: Page): Promise<CardFact[]> => page.locator("[data-tutorial-card]").evaluateAll((nodes) =>
  nodes.map((node) => {
    const element = node as HTMLElement;
    const rect = element.getBoundingClientRect();
    const title = element.querySelector("h2") as HTMLElement | null;
    const style = getComputedStyle(element);
    return {
      text: element.textContent?.replace(/\s+/g, " ").trim() ?? "",
      tag: element.tagName,
      featured: element.dataset.featured === "true",
      width: rect.width,
      height: rect.height,
      top: rect.top,
      left: rect.left,
      borderWidth: Number.parseFloat(style.borderTopWidth),
      paddingTop: Number.parseFloat(style.paddingTop),
      titleSize: title ? Number.parseFloat(getComputedStyle(title).fontSize) : 0,
      role: element.getAttribute("role"),
      tabIndex: element.getAttribute("tabindex"),
      cursor: style.cursor,
    };
  }),
);

const assertCardGeometry = (viewportId: string, cards: CardFact[]) => {
  assert.equal(cards.length, 4);
  const [feature, ...secondary] = cards;
  assert.equal(feature?.featured, true);
  assert.ok(secondary.every((card) => !card.featured));
  assert.ok(secondary.every((card) => feature.top < card.top));
  assert.equal(feature.borderWidth, 2);
  assert.ok(secondary.every((card) => card.borderWidth <= 1));
  assert.ok(secondary.every((card) => feature.titleSize / card.titleSize >= 1.3));
  assert.ok(cards.every((card) => card.tag === "ARTICLE" && card.role === null && card.tabIndex === null && card.cursor !== "pointer"));
  if (viewportId === "desktop") {
    assert.ok(secondary.every((card) => feature.width / card.width >= 2.8));
    assert.ok(secondary.every((card) => feature.height / card.height >= 1.45));
    assert.ok(secondary.every((card) => (feature.width * feature.height) / (card.width * card.height) >= 4));
    assert.ok(secondary.every((card) => feature.titleSize / card.titleSize >= 1.35));
  } else if (viewportId === "tablet") {
    assert.ok(secondary.every((card) => feature.width / card.width >= 2.7));
    assert.ok(secondary.every((card) => feature.height / card.height >= 1.4));
    assert.ok(secondary.every((card) => (feature.width * feature.height) / (card.width * card.height) >= 3.7));
  } else {
    assert.ok(secondary.every((card) => Math.abs(feature.width - card.width) < 1));
    assert.ok(secondary.every((card) => feature.height / card.height >= 1.65));
    assert.ok(secondary.every((card) => feature.paddingTop > card.paddingTop));
  }
};

const runViewport = async (browser: Browser, viewport: {id: string; width: number; height: number}) => {
  const context: BrowserContext = await browser.newContext({viewport: {width: viewport.width, height: viewport.height}});
  const network: Array<{url: string; method: string; kind: string}> = [];
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  await context.addInitScript(() => localStorage.setItem("da_welcome_never_show", "1"));
  await context.route("**/*", (route) => routeLoopbackOnly(route, network));
  const page = await context.newPage();
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  try {
    await page.goto(ORIGIN, {waitUntil: "domcontentloaded"});
    await page.evaluate(() => localStorage.setItem("da_welcome_never_show", "1"));
    await page.reload({waitUntil: "domcontentloaded"});
    await page.waitForTimeout(750);
    const retainedHome = ["New Project", "Open Project", "My Project", "Tutorials", "AI Assistant", "Export", "AI Project Finalizer"];
    for (const name of retainedHome) await page.getByRole("button", {name: new RegExp(`^${name}\\b`)}).waitFor();
    assert.equal(await page.getByText("AI Credits", {exact: true}).count(), 0);

    const tutorialsButton = page.getByRole("button", {name: /^Tutorials\b/});
    await tutorialsButton.click();
    await page.getByRole("heading", {level: 1, name: "Welcome to Diamond Animator", exact: true}).waitFor();
    assert.equal(await page.getByRole("banner").count(), 0);
    assert.equal(await page.getByRole("heading", {level: 1}).count(), 1);
    assert.equal(await page.locator("[data-tutorial-card]").count(), 4);
    assert.equal(await page.locator("[data-tutorial-card] button, [data-tutorial-card] a, [data-tutorial-card] video, [data-tutorial-card] audio, [data-tutorial-card] img, [data-tutorial-card] iframe, [data-tutorial-card] canvas").count(), 0);
    assert.equal(await page.getByText("COMING LATER", {exact: true}).count(), 4);

    const cards = await readCards(page);
    const expectedTexts = [
      "Start HereCOMING LATER",
      "Create Your First AnimationCOMING LATER",
      "Create with AICOMING LATER",
      "Finalize Your AnimationCOMING LATER",
    ];
    assert.deepEqual(cards.map((card) => card.text), expectedTexts);
    assertCardGeometry(viewport.id, cards);

    const overflow = await page.evaluate(() => ({
      horizontal: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      vertical: document.documentElement.scrollHeight > document.documentElement.clientHeight,
    }));
    assert.equal(overflow.horizontal, false);
    if (viewport.id !== "phone") assert.equal(overflow.vertical, false);

    await page.screenshot({path: resolve(SCREENSHOTS, `${viewport.id}.png`), fullPage: false});
    await page.getByRole("button", {name: "Back", exact: true}).click();
    await page.waitForTimeout(50);
    const focusReturn = await page.evaluate(() => ({
      tag: document.activeElement?.tagName,
      text: document.activeElement?.textContent?.replace(/\s+/g, " ").trim() ?? "",
    }));
    assert.equal(focusReturn.tag, "BUTTON");
    assert.ok(focusReturn.text.startsWith("Tutorials"));
    assert.equal(await page.getByText("AI Credits", {exact: true}).count(), 0);

    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(pageErrors, []);
    assert.equal(network.filter((entry) => entry.kind === "denied-external").length, 0);
    return {viewport, cards, overflow, consoleErrors, pageErrors, network};
  } finally {
    await context.close();
  }
};

const main = async () => {
  assert.equal(existsSync(OUTPUT), false, "Refusing pre-existing SPEC-0003 proof output collision.");
  assertBrowserPlan(readBrowserPlan());
  assert.ok(existsSync(CHROME), "Local Chrome is required.");
  mkdirSync(SCREENSHOTS, {recursive: true});

  let server: ChildProcess | null = null;
  let browser: Browser | null = null;
  try {
    server = spawn(resolve(ROOT, "node_modules/.bin/next"), ["dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(PORT)], {
      cwd: ROOT,
      env: {...process.env, NEXT_TELEMETRY_DISABLED: "1"},
      stdio: ["ignore", "pipe", "pipe"],
    });
    const serverLog: string[] = [];
    server.stdout?.on("data", (chunk) => serverLog.push(String(chunk)));
    server.stderr?.on("data", (chunk) => serverLog.push(String(chunk)));
    await waitForServer();
    browser = await chromium.launch({headless: true, executablePath: CHROME});
    const plan = readBrowserPlan();
    const results = [];
    for (const viewport of plan.viewports) results.push(await runViewport(browser, viewport));
    const result = {
      version: 1,
      status: "passed",
      viewports: results,
      screenshotCount: plan.viewports.length,
      assertionGroups: 14,
      externalRequestCount: results.flatMap((entry) => entry.network).filter((entry) => entry.kind === "denied-external").length,
      apiRequestCount: results.flatMap((entry) => entry.network).filter((entry) => new URL(entry.url).pathname === "/api/ai").length,
      serverLog,
    };
    writeFileSync(resolve(OUTPUT, "browser-result.json"), `${JSON.stringify(result, null, 2)}\n`);
    process.stdout.write("SPEC-0003 Tutorials browser proof PASS: 3 viewports, 3 screenshots, 0 external requests.\n");
  } finally {
    if (browser) await browser.close();
    await stopServer(server);
  }
};

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
