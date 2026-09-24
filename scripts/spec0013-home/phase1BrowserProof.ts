import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const origin = process.env.SPEC0013_ORIGIN ?? "http://127.0.0.1:58080";
const output = "output/spec-0013/phase-1/browser";
mkdirSync(output, { recursive: true });
const checks: string[] = [];
const errors: string[] = [];
const externalRequests: string[] = [];
const check = (value: unknown, label: string) => { assert.ok(value, label); checks.push(label); };
const equal = (actual: unknown, expected: unknown, label: string) => { assert.deepEqual(actual, expected, label); checks.push(label); };
const profiles = [
  { name: "desktop", width: 1440, height: 900, maxScroll: 290 },
  { name: "medium", width: 1024, height: 768, maxScroll: 422 },
  { name: "compact", width: 390, height: 844, maxScroll: 428 },
] as const;

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--disable-background-networking", "--disable-component-update", "--disable-sync", "--no-first-run"] });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    localStorage.setItem("da_welcome_seen", "1");
    localStorage.setItem("da_welcome_never_show", "1");
  });
  await context.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { externalRequests.push(url.href); await route.abort(); return; }
    await route.continue();
  });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${origin}/`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Workspace" }).waitFor();

  equal(await page.getByText("AI Project Finalizer", { exact: true }).count(), 0, "Finalizer text is absent");
  equal(await page.getByRole("button", { name: /AI Project Finalizer/ }).count(), 0, "Finalizer has no button semantics");
  const mainButtons = page.locator("main button");
  equal(await mainButtons.count(), 6, "Home has exactly six remaining cards");
  check((await mainButtons.last().innerText()).includes("Export"), "Export is the final Home button");

  const measurements: Record<string, unknown>[] = [];
  for (const profile of profiles) {
    await page.setViewportSize({ width: profile.width, height: profile.height });
    const measurement = await page.evaluate(() => {
      const main = document.querySelector<HTMLElement>(".home-main-scroll")!;
      const exportButton = [...document.querySelectorAll<HTMLButtonElement>("main button")].find(button => button.textContent?.includes("Export your animation"))!;
      main.scrollTop = main.scrollHeight;
      main.dispatchEvent(new Event("scroll"));
      return {
        clientHeight: main.clientHeight,
        scrollHeight: main.scrollHeight,
        maxScroll: main.scrollHeight - main.clientHeight,
        scrollTop: main.scrollTop,
        bottomGap: Math.round(main.getBoundingClientRect().bottom - exportButton.getBoundingClientRect().bottom),
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        bodyIsScroller: document.body.scrollHeight > innerHeight,
        activeClass: main.classList.contains("is-scroll-active"),
      };
    });
    check(Math.abs(measurement.maxScroll - profile.maxScroll) <= 2, `${profile.name} Home scroll range matches the SPEC-0013 target`);
    check(Math.abs(measurement.bottomGap - 60) <= 2, `${profile.name} keeps the 60px Export breathing room`);
    equal(measurement.horizontalOverflow, 0, `${profile.name} has no horizontal page overflow`);
    equal(measurement.bodyIsScroller, false, `${profile.name} keeps Home scrolling on main`);
    equal(measurement.activeClass, true, `${profile.name} reveals the existing scrollbar while scrolling`);
    await page.waitForTimeout(420);
    equal(await page.locator(".home-main-scroll").evaluate(element => element.classList.contains("is-scroll-active")), false, `${profile.name} scrollbar returns to its idle state`);
    await page.screenshot({ path: `${output}/${profile.name}-bottom.png`, fullPage: false });
    measurements.push({ profile: profile.name, ...measurement });
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Export Export your animation." }).focus();
  equal(await page.evaluate(() => document.activeElement?.textContent?.replace(/\s+/g, "").startsWith("Export")), true, "Export is keyboard focusable as the final Home card");
  await page.getByRole("button", { name: "Export Export your animation." }).click();
  await page.getByRole("main", { name: "Choose a saved animation to export" }).waitFor();
  checks.push("Export still opens the accepted chooser");
  await page.getByRole("button", { name: "← Back" }).click();
  await page.getByRole("button", { name: "AI Assistant Ask questions and get guidance." }).click();
  await page.getByRole("textbox", { name: "Message the Assistant" }).waitFor();
  await page.getByRole("combobox", { name: "Reasoning level" }).waitFor();
  checks.push("Assistant still opens with composer and reasoning controls");
  await page.getByRole("link", { name: "Back to Home" }).click();
  await page.getByRole("button", { name: "AI Assistant Ask questions and get guidance." }).waitFor();
  checks.push("Assistant returns to Home");

  equal(externalRequests, [], "browser proof makes no external requests");
  equal(errors, [], "browser proof has no page errors");
  const result = { status: "PASS", origin, checks, checkCount: checks.length, profiles: measurements, externalRequests, errors, realProviderCalls: 0, paidCalls: 0 };
  writeFileSync(`${output}/result.json`, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ status: result.status, checks: result.checkCount, profiles: profiles.length }));
  await context.close();
} finally {
  await browser.close();
}
