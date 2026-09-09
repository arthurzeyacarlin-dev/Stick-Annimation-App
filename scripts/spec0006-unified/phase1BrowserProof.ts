import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { chromium, type Page } from "playwright-core";

const arg = (name: string) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const url = arg("url");
const output = resolve(arg("output") ?? "output/spec-0006/phase-1/browser/result.json");
if (!url || !/^http:\/\/(?:127\.0\.0\.1|localhost):\d+\/$/.test(url)) throw new Error("A loopback --url ending in / is required.");
const origin = new URL(url).origin;
const screenshotRoot = resolve(dirname(output), "screenshots");
const profileRoot = resolve(dirname(output), "profile");
mkdirSync(screenshotRoot, { recursive: true });
rmSync(profileRoot, { recursive: true, force: true });

const chromeCandidates = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
].filter((value): value is string => Boolean(value));
const executablePath = chromeCandidates.find(existsSync);
if (!executablePath) throw new Error("No Chromium executable was found.");

const operations: string[] = [];
const screenshots: Array<{ id: string; path: string; sha256: string; byteLength: number }> = [];
const requests: Array<{ method: string; url: string; disposition: "allowed-loopback" | "fulfilled-local" | "blocked" }> = [];
const consoleErrors: string[] = [];
const pageErrors: string[] = [];

const snap = async (page: Page, id: string) => {
  const path = resolve(screenshotRoot, `${id}.png`);
  const bytes = await page.screenshot({ path, fullPage: true });
  screenshots.push({ id, path, sha256: createHash("sha256").update(bytes).digest("hex"), byteLength: bytes.byteLength });
};

const dismissWelcome = async (page: Page) => {
  const dialog = page.getByRole("dialog", { name: /Welcome to Diamond Animator/i });
  if (await dialog.isVisible().catch(() => false)) {
    // The inherited close hitbox is partly overlapped by the unchanged header; its
    // existing Escape handler is the reliable keyboard path and changes no product CSS.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    operations.push("welcome-close");
  }
};

const openNew = async (page: Page) => {
  await page.getByRole("button", { name: /^New Project/ }).click();
  await page.getByRole("button", { name: /^Drawing Animation/ }).waitFor();
  await page.getByRole("button", { name: /^Stick Figure Animation/ }).waitFor();
  operations.push("home-new-split-visible");
};

const context = await chromium.launchPersistentContext(profileRoot, {
  executablePath,
  headless: true,
  viewport: { width: 1440, height: 900 },
  args: ["--disable-background-networking", "--disable-component-update", "--disable-default-apps", "--disable-extensions", "--disable-sync", "--no-first-run"],
});
try {
  await context.route("**/*", async (route) => {
    const request = route.request();
    const parsed = new URL(request.url());
    const isAvailability = parsed.origin === origin && parsed.pathname === "/api/ai" && request.method() === "GET";
    const allowed = parsed.origin === origin && !parsed.pathname.startsWith("/api/");
    const disposition = isAvailability ? "fulfilled-local" : allowed ? "allowed-loopback" : "blocked";
    requests.push({ method: request.method(), url: `${parsed.origin}${parsed.pathname}`, disposition });
    if (isAvailability) await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ available: false, reason: "proof-disabled" }) });
    else if (allowed) await route.continue();
    else await route.abort("blockedbyclient");
  });
  const page = context.pages()[0] ?? await context.newPage();
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto(url, { waitUntil: "networkidle" });
  await dismissWelcome(page);
  await page.getByRole("button", { name: /^New Project/ }).waitFor();
  await page.getByRole("button", { name: /^Open Project/ }).waitFor();
  operations.push("ordinary-home-visible");
  await snap(page, "ordinary-home");

  await openNew(page);
  await snap(page, "ordinary-new-split");
  await page.getByRole("button", { name: /^Drawing Animation/ }).click();
  await page.getByText("Unnamed drawing project", { exact: true }).waitFor();
  await page.getByRole("button", { name: /^File$/ }).waitFor();
  await page.getByRole("textbox", { name: "Chat here" }).waitFor();
  await page.locator("canvas").first().waitFor();
  operations.push("ordinary-drawing-mounted");
  await snap(page, "ordinary-drawing");

  await page.goto(url, { waitUntil: "networkidle" });
  await dismissWelcome(page);
  await openNew(page);
  await page.getByRole("button", { name: /^Stick Figure Animation/ }).click();
  await page.getByText("Unnamed stick figure project", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Stick Figure Tools" }).click();
  await page.getByRole("button", { name: "Create New Stick Figure" }).waitFor();
  operations.push("ordinary-stick-mounted");
  await snap(page, "ordinary-stick");

  await page.getByRole("button", { name: "Create New Stick Figure" }).click();
  await page.getByRole("button", { name: "Save Stick Figure" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Save Stick Figure" }).isDisabled(), true);
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByText("Unnamed stick figure project", { exact: true }).waitFor();
  operations.push("ordinary-creator-back");

  await page.goto(url, { waitUntil: "networkidle" });
  await dismissWelcome(page);
  await page.getByRole("button", { name: /^Open Project/ }).click();
  await page.getByRole("button", { name: "Drawing" }).waitFor();
  await page.getByRole("button", { name: "Stick Figure" }).waitFor();
  operations.push("ordinary-open-type-tabs-visible");
  await snap(page, "ordinary-open-split");

  assert.equal(consoleErrors.length, 0, `Console errors: ${consoleErrors.join(" | ")} | blocked: ${requests.filter((request) => request.disposition === "blocked").map((request) => request.url).join(" | ")}`);
  assert.equal(pageErrors.length, 0, `Page errors: ${pageErrors.join(" | ")}`);
  assert.equal(requests.some((request) => request.disposition === "blocked"), false, "Ordinary smoke attempted non-availability API or external traffic.");
  const result = {
    status: "PASS",
    url,
    viewport: { width: 1440, height: 900 },
    operations,
    screenshots,
    requestCount: requests.length,
    deterministicAvailabilityRequests: requests.filter((request) => request.disposition === "fulfilled-local").length,
    apiRequests: 0,
    externalRequests: 0,
    consoleErrors,
    pageErrors,
    reviewOnlyUi: false,
    unchangedOrdinaryFlow: true,
  };
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  await context.close();
  rmSync(profileRoot, { recursive: true, force: true });
}
